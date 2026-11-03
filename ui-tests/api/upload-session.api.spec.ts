/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import {
    UPLOAD_CHUNK_SIZE, UploadSessionOptions, UploadSessionService,
} from '../../src/services/StorageExplorer/UploadSessionService';
import { StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import { DriveGraphService } from '../../src/services/StorageExplorer/DriveGraphService';
import { OPERATION_SCHEMAS } from '../../src/services/StorageExplorer/operationSchemas';
import type { NetworkRequest } from '../../src/services/StorageExplorer/protocol';
import { FakeGraphClient } from './fakeClient';

const URL = 'https://contoso.sharepoint.com/contentstorage/test/_api/v2.0/drives/d1/items/i1/uploadSession';
const TOKEN = 'eyJhbGciOiJub25lIn0.eyJhdWQiOiJzaGFyZXBvaW50In0.test-signature';
const ALIGNMENT = 320 * 1024;
const context = { onProgress: () => { /* unused */ } };

function harness(query = '') {
    const calls: Parameters<NonNullable<UploadSessionOptions['fetch']>>[] = [];
    const origins: string[] = [];
    const logs: NetworkRequest[] = [];
    let identity = 'tenant:account';
    let respond = () => new Response(JSON.stringify({ id: 'item1' }), { status: 201 });
    const options: UploadSessionOptions = {
        getIdentity: () => identity,
        acquireToken: async origin => { origins.push(origin); return TOKEN; },
        onNetworkRequest: entry => logs.push(entry),
        fetch: async (...args) => { calls.push(args); return respond(); },
    };
    const service = new UploadSessionService(options);
    const register = () => service.register('d1', { uploadUrl: URL + query }, identity);
    return {
        service, options, calls, origins, logs, register,
        setIdentity: (value: string) => { identity = value; },
        setResponse: (value: typeof respond) => { respond = value; },
    };
}

test('plain SharePoint URLs get a host-side token; preauthenticated URLs do not', async () => {
    for (const query of ['', '?tempauth=TEST-SESSION-SECRET', '?access_token=TEST-SESSION-SECRET']) {
        const h = harness(query);
        const id = h.register();
        const bytes = new Uint8Array([1, 2, 3]);
        expect(id).not.toContain(URL);
        await expect(h.service.uploadChunk('d1', id, 0, 3, bytes))
            .resolves.toEqual({ done: true, nextOffset: 3, itemId: 'item1' });
        const [url, init] = h.calls[0];
        expect(url).toBe(URL + query);
        expect(init).toMatchObject({
            method: 'PUT', redirect: 'error', body: bytes,
            headers: { 'Content-Length': '3', 'Content-Range': 'bytes 0-2/3' },
        });
        expect(init.headers.Authorization).toBe(query ? undefined : `Bearer ${TOKEN}`);
        expect(h.origins).toEqual(query ? [] : ['https://contoso.sharepoint.com']);
        expect(JSON.stringify(h.logs)).not.toContain(TOKEN);
        expect(JSON.stringify(h.logs)).not.toContain('TEST-SESSION-SECRET');
        await expect(h.service.uploadChunk('d1', id, 0, 3, bytes)).rejects.toThrow('Invalid upload session');
    }
});

test('sequential chunks preserve ranges and project the completed item on the host', async () => {
    const h = harness();
    const fake = new FakeGraphClient();
    fake.responder = call => call.method === 'POST'
        ? { uploadUrl: URL }
        : { id: 'item1', name: 'large.mp4', size: UPLOAD_CHUNK_SIZE + 1, file: { mimeType: 'video/mp4' } };
    const drive = new DriveGraphService(fake as unknown as Client, h.options);
    const id = await drive.createUploadSession('d1', null, 'large.mp4');
    h.setResponse(() => new Response(JSON.stringify({ nextExpectedRanges: [`${UPLOAD_CHUNK_SIZE}-`] }), { status: 202 }));
    await expect(drive.uploadChunk('d1', id, 0, UPLOAD_CHUNK_SIZE + 1, new Uint8Array(UPLOAD_CHUNK_SIZE)))
        .resolves.toEqual({ done: false, nextOffset: UPLOAD_CHUNK_SIZE, item: undefined });
    h.setResponse(() => new Response(JSON.stringify({ id: 'item1' }), { status: 201 }));
    const result = await drive.uploadChunk('d1', id, UPLOAD_CHUNK_SIZE, UPLOAD_CHUNK_SIZE + 1, new Uint8Array([7]));
    expect(result).toMatchObject({ done: true, nextOffset: UPLOAD_CHUNK_SIZE + 1, item: { id: 'item1', name: 'large.mp4' } });
    expect(h.calls.map(([, init]) => init.headers['Content-Range'])).toEqual([
        `bytes 0-${UPLOAD_CHUNK_SIZE - 1}/${UPLOAD_CHUNK_SIZE + 1}`,
        `bytes ${UPLOAD_CHUNK_SIZE}-${UPLOAD_CHUNK_SIZE}/${UPLOAD_CHUNK_SIZE + 1}`,
    ]);
});

test('a 150,000,000-byte upload completes with bounded, correctly aligned chunks', async () => {
    const h = harness();
    const total = 150_000_000;
    const id = h.register();
    const bytes = new Uint8Array(UPLOAD_CHUNK_SIZE);
    let offset = 0;
    while (offset < total) {
        const end = Math.min(offset + bytes.length, total);
        h.setResponse(() => new Response(JSON.stringify(end === total
            ? { id: 'item1' }
            : { nextExpectedRanges: [`${end}-`] }), { status: end === total ? 201 : 202 }));
        const result = await h.service.uploadChunk('d1', id, offset, total, bytes.subarray(0, end - offset));
        expect(result.done).toBe(end === total);
        offset = result.nextOffset;
    }
    expect(h.calls).toHaveLength(26);
    expect(h.calls[0][1].headers['Content-Range']).toBe('bytes 0-5898239/150000000');
    expect(h.calls[25][1].headers['Content-Range']).toBe('bytes 147456000-149999999/150000000');
});

test('untrusted destinations are rejected without requesting a token or sending bytes', async () => {
    const h = harness();
    for (const uploadUrl of [
        'http://contoso.sharepoint.com/uploadSession',
        'https://contoso.sharepoint.com.evil.example/uploadSession',
        'https://evil.example/uploadSession',
        'https://user:password@contoso.sharepoint.com/uploadSession',
        'https://contoso.sharepoint.com:8443/uploadSession',
        'https://contoso.sharepoint.com/uploadSession#secret',
        'not a URL',
    ]) {
        expect(() => h.service.register('d1', { uploadUrl }, 'tenant:account')).toThrow(/upload session/);
    }
    expect(h.origins).toEqual([]);
    expect(h.calls).toEqual([]);
});

test('sessions are bound to their panel, drive, account and lifetime', async () => {
    const h = harness();
    const id = h.register();
    const other = harness();
    await expect(other.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('Invalid upload session');
    await expect(h.service.uploadChunk('d2', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('Invalid upload session');
    h.setIdentity('another-tenant:account');
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('account changed');
    const newId = h.register();
    h.service.dispose();
    await expect(h.service.uploadChunk('d1', newId, 0, 1, new Uint8Array([1]))).rejects.toThrow('Invalid upload session');
    expect(h.calls).toEqual([]);
    expect(h.origins).toEqual([]);
});

test('an account switch while acquiring a token prevents sending the chunk', async () => {
    const h = harness();
    h.options.acquireToken = async () => { h.setIdentity('different-account'); return TOKEN; };
    const id = h.register();
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('account changed');
    expect(h.calls).toEqual([]);
});

test('authentication failures and duplicate in-flight chunks do not send extra requests', async () => {
    const h = harness();
    const id = h.register();
    h.options.acquireToken = async () => { throw new Error('SharePoint consent required'); };
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('consent required');
    expect(h.calls).toEqual([]);
    let resolveToken: (token: string) => void = () => { /* assigned below */ };
    h.options.acquireToken = () => new Promise(resolve => { resolveToken = resolve; });
    const first = h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]));
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('already in progress');
    resolveToken(TOKEN);
    await first;
    expect(h.calls).toHaveLength(1);
});

test('expired sessions and malformed or oversized ranges fail before network access', async () => {
    const h = harness();
    expect(() => h.service.register('d1', {
        uploadUrl: URL, expirationDateTime: new Date(Date.now() - 1000).toISOString(),
    }, 'tenant:account')).toThrow('expired');
    const id = h.register();
    for (const [offset, total, length] of [
        [-1, 5, 1], [1, 5, 1], [0, 0, 1], [0, 1, 0],
        [0, 1, 2], [0, 3, 1], [0, UPLOAD_CHUNK_SIZE + 2, UPLOAD_CHUNK_SIZE + 1],
    ]) {
        await expect(h.service.uploadChunk('d1', id, offset, total, new Uint8Array(length)))
            .rejects.toThrow('Invalid upload chunk');
    }
    expect(h.calls).toEqual([]);
    expect(h.origins).toEqual([]);
});

test('invalid next ranges cannot loop forever or silently skip bytes', async () => {
    for (const range of ['0-', 'nonsense', '1-', `${ALIGNMENT * 2}-`]) {
        const h = harness();
        const id = h.register();
        h.setResponse(() => new Response(JSON.stringify({ nextExpectedRanges: [range] }), { status: 202 }));
        await expect(h.service.uploadChunk('d1', id, 0, ALIGNMENT + 1, new Uint8Array(ALIGNMENT)))
            .rejects.toThrow('Invalid next upload range');
        expect(h.calls).toHaveLength(1);
    }
});

test('401s retain safe diagnostics; network exceptions never expose session URLs', async () => {
    const h = harness('?tempauth=TEST-SESSION-SECRET');
    const id = h.register();
    h.setResponse(() => new Response(JSON.stringify({
        error: { code: 'unauthenticated', message: `Unauthenticated ${TOKEN}` },
    }), { status: 401 }));
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1])))
        .rejects.toThrow('Session URL tempauth parameter: present.');
    expect(h.logs[0].error).not.toContain(TOKEN);
    h.options.fetch = async () => { throw new Error(URL + '?tempauth=TEST-SESSION-SECRET'); };
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1])))
        .rejects.toThrow('Check your connection');
    expect(JSON.stringify(h.logs)).not.toContain('TEST-SESSION-SECRET');
});

test('cancellation authenticates on the host and retires the handle', async () => {
    const h = harness();
    const id = h.register();
    h.setResponse(() => new Response(null, { status: 204 }));
    await h.service.cancel('d1', id);
    expect(h.calls[0][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` }, redirect: 'error' });
    await expect(h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]))).rejects.toThrow('Invalid upload session');
});

test('cancellation prevents a pending token acquisition from starting another chunk', async () => {
    const h = harness();
    const id = h.register();
    let resolveToken: (token: string) => void = () => { /* assigned below */ };
    let resolveDelete: (response: Response) => void = () => { /* assigned below */ };
    let acquisitions = 0;
    h.options.acquireToken = async () => ++acquisitions === 1
        ? new Promise<string>(resolve => { resolveToken = resolve; })
        : TOKEN;
    h.options.fetch = async (...args) => {
        h.calls.push(args);
        return new Promise<Response>(resolve => { resolveDelete = resolve; });
    };
    const upload = h.service.uploadChunk('d1', id, 0, 1, new Uint8Array([1]));
    const cancellation = h.service.cancel('d1', id);
    await expect.poll(() => h.calls.length).toBe(1);
    resolveToken(TOKEN);
    await expect(upload).rejects.toThrow('Invalid upload session');
    expect(h.calls[0][1].method).toBe('DELETE');
    resolveDelete(new Response(null, { status: 204 }));
    await cancellation;
    expect(h.calls).toHaveLength(1);
});

test('RPC rejects URLs and oversized chunks and gates chunk/cancel operations before Graph', async () => {
    const fake = new FakeGraphClient();
    const api = new StorageExplorerApi('ct1', fake as unknown as Client, async () => ['read']);
    const params = { driveId: 'd1', sessionId: '00000000-0000-4000-8000-000000000000' };
    for (const op of ['drive.uploadChunk', 'drive.cancelUploadSession'] as const) {
        await expect(api.execute(op, { ...params, offset: 0, total: 1, bytes: new Uint8Array([1]) }, context))
            .rejects.toMatchObject({ code: 'missingExtensionAppPermissions', requiredScopes: ['writeContent'] });
    }
    expect(fake.calls).toEqual([]);
    expect(() => OPERATION_SCHEMAS['drive.uploadChunk'].parse({
        ...params, sessionId: URL, offset: 0, total: 1, bytes: new Uint8Array([1]),
    })).toThrow();
    expect(() => OPERATION_SCHEMAS['drive.uploadChunk'].parse({
        ...params, offset: 0, total: UPLOAD_CHUNK_SIZE + 1, bytes: new Uint8Array(UPLOAD_CHUNK_SIZE + 1),
    })).toThrow('Invalid upload chunk size');
});
