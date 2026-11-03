/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import { GraphError } from '@microsoft/microsoft-graph-client';
import { request as httpRequest } from 'http';
import { FilePreviewService, FilePreviewFailure, FilePreviewKind } from '../../src/services/StorageExplorer/FilePreviewService';
import { StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import { OPERATION_SCHEMAS } from '../../src/services/StorageExplorer/operationSchemas';
import { FakeGraphClient } from './fakeClient';

const CONTENT = '%PDF-1.7\nGraph-only PDF test content\n%%EOF\n';
const metadata = { name: 'Report.pdf', size: CONTENT.length, file: { mimeType: 'application/pdf' }, malware: null };
const services: FilePreviewService[] = [];

test.afterEach(() => {
    for (const service of services.splice(0)) { service.dispose(); }
});

function harness(kind: FilePreviewKind = 'pdf') {
    const fake = new FakeGraphClient();
    const state = { identity: 'tenant:account', allowed: true, errors: 0, url: '', failures: [] as FilePreviewFailure[] };
    fake.responder = call => {
        if (!call.path.endsWith('/contentStream')) {
            return kind === 'pdf' ? metadata : { ...metadata, name: 'Clip.mp4', file: { mimeType: 'video/mp4' } };
        }
        const range = /^bytes=(\d+)-(\d+)$/.exec(call.headers.Range ?? '');
        return range
            ? new Response(CONTENT.slice(Number(range[1]), Number(range[2]) + 1), {
                status: 206,
                headers: { 'Content-Range': `bytes ${range[1]}-${range[2]}/${CONTENT.length}` },
            })
            : new Response(CONTENT);
    };
    const service = new FilePreviewService(fake as unknown as Client, () => state.identity);
    services.push(service);
    const authorize = async (): Promise<void> => {
        if (!state.allowed) { throw new Error('Permission removed'); }
    };
    const open = async (): Promise<void> => {
        await service.open('d1', 'i1', authorize, async url => {
            state.url = url;
            return true;
        }, failure => { state.errors++; state.failures.push(failure); }, kind);
    };
    return { fake, state, service, authorize, open };
}

for (const kind of ['pdf', 'mp4'] as const) {
    test(`streams ${kind} directly from Graph and never returns content, credentials, or URLs over RPC`, async () => {
        const h = harness(kind);
        const api = new StorageExplorerApi('ct1', h.fake as unknown as Client, async () => ['readContent']);
        const respond = h.fake.responder;
        h.fake.responder = call => call.path.includes('/storage/fileStorage/containers/')
            ? { containerTypeId: 'ct1' } : respond(call);
        try {
            const openPreview = async (driveId: string, itemId: string, authorize: () => Promise<void>): Promise<void> => {
                expect({ driveId, itemId }).toEqual({ driveId: 'd1', itemId: 'i1' });
                await h.service.open(driveId, itemId, authorize, async url => {
                    h.state.url = url;
                    return true;
                }, () => { h.state.errors++; }, kind);
            };
            const result = await api.execute(kind === 'pdf' ? 'drive.openPdf' : 'drive.openVideo', { driveId: 'd1', itemId: 'i1' }, {
                onProgress: () => undefined,
                openPdf: openPreview,
                openVideo: openPreview,
            });
            expect(result).toBeUndefined();
            const url = new URL(h.state.url);
            expect(url.hostname).toBe('127.0.0.1');
            expect(url.pathname).toMatch(new RegExp(`^/[a-f0-9]{64}/preview\\.${kind}$`));
            const response = await fetch(url);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe(kind === 'pdf' ? 'application/pdf' : 'video/mp4');
            expect(response.headers.get('content-disposition')).toContain('inline;');
            expect(response.headers.get('cache-control')).toContain('no-store');
            expect(response.headers.get('access-control-allow-origin')).toBeNull();
            expect(await response.text()).toBe(CONTENT);
            expect(h.fake.last).toMatchObject({
                method: 'GET', path: '/drives/d1/items/i1/contentStream', version: 'beta', responseType: 'raw',
            });
            expect(h.fake.last.middlewareOptions).toHaveLength(1);
            expect(h.state.errors).toBe(0);
        } finally {
            await api.dispose();
        }
    });

    test(`validates ${kind} identifiers and denies missing readContent before opening a listener or calling Graph`, async () => {
        const h = harness(kind);
        const operation = kind === 'pdf' ? 'drive.openPdf' : 'drive.openVideo';
        const api = new StorageExplorerApi('ct1', h.fake as unknown as Client, async () => ['read']);
        try {
            await expect(api.execute(operation, { driveId: 'd1', itemId: 'i1' }, {
                onProgress: () => undefined,
                openPdf: async () => { throw new Error('Must not run'); },
                openVideo: async () => { throw new Error('Must not run'); },
            })).rejects.toMatchObject({ code: 'missingExtensionAppPermissions', requiredScopes: ['readContent'] });
            expect(OPERATION_SCHEMAS[operation].safeParse({ driveId: 'd1', itemId: '../other' }).success).toBe(false);
            expect(h.fake.calls).toHaveLength(0);
            expect(h.state.url).toBe('');
        } finally {
            await api.dispose();
        }
    });

    for (const range of [
        { header: 'bytes=5-11', start: 5, end: 11 },
        { header: 'bytes=5-', start: 5, end: CONTENT.length - 1 },
        { header: 'bytes=-5', start: CONTENT.length - 5, end: CONTENT.length - 1 },
        { header: 'bytes=0-9999', start: 0, end: CONTENT.length - 1 },
    ]) {
        test(`supports native ${kind} range requests (${range.header})`, async () => {
            const h = harness(kind);
            await h.open();
            const response = await fetch(h.state.url, { headers: { Range: range.header } });
            expect(response.status).toBe(206);
            expect(response.headers.get('content-range')).toBe(`bytes ${range.start}-${range.end}/${CONTENT.length}`);
            expect(await response.text()).toBe(CONTENT.slice(range.start, range.end + 1));
            expect(h.fake.last.headers.Range).toBe(`bytes=${range.start}-${range.end}`);
        });
    }
}

test('MP4 preview rejects non-MP4 or malware metadata before opening a player', async () => {
    for (const item of [
        metadata,
        { ...metadata, file: { mimeType: 'video/webm' } },
        { ...metadata, file: { mimeType: 'video/mp4' }, malware: {} },
    ]) {
        const h = harness('mp4');
        h.fake.responder = () => item;
        await expect(h.open()).rejects.toThrow('not an available MP4');
        expect(h.state.url).toBe('');
        expect(h.fake.calls).toHaveLength(1);
    }
});

test('rejects invalid/multipart ranges without requesting Graph content; HEAD returns no bytes', async () => {
    const h = harness();
    await h.open();
    for (const range of ['bytes=0-1,4-5', 'bytes=999-', 'bytes=-0', 'bytes=5-2', 'bytes=-99999999999999999']) {
        const response = await fetch(h.state.url, { headers: { Range: range } });
        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe(`bytes */${CONTENT.length}`);
    }
    const head = await fetch(h.state.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(CONTENT.length));
    expect(await head.text()).toBe('');
    expect(h.fake.calls).toHaveLength(1);
});

test('handles a Graph server that ignores Range by returning the complete 200 response', async () => {
    const h = harness();
    await h.open();
    h.fake.responder = () => new Response(CONTENT);
    const response = await fetch(h.state.url, { headers: { Range: 'bytes=0-5' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-range')).toBeNull();
    expect(await response.text()).toBe(CONTENT);
});

test('retries transient stream denials without changing the requested PDF range', async () => {
    const h = harness();
    await h.open();
    const respond = h.fake.responder;
    let attempts = 0;
    let cancelled = 0;
    h.fake.responder = call => {
        attempts++;
        if (attempts <= 2) {
            return new Response(new ReadableStream<Uint8Array>({
                cancel() { cancelled++; },
            }), { status: 403 });
        }
        return respond(call);
    };
    const response = await fetch(h.state.url, { headers: { Range: 'bytes=5-11' } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(CONTENT.slice(5, 12));
    const contentCalls = h.fake.calls.filter(call => call.path.endsWith('/contentStream'));
    expect(contentCalls).toHaveLength(3);
    expect(contentCalls.every(call => call.headers.Range === 'bytes=5-11' && call.version === 'beta')).toBe(true);
    expect(cancelled).toBe(2);
    expect(h.state.errors).toBe(0);
});

test('retries SDK-thrown 403s and reports only safe service diagnostics when denial persists', async () => {
    const h = harness();
    await h.open();
    const requestId = '95ddfa7b-a543-46aa-9b51-332361488ecc';
    const error = new GraphError(403, 'private upstream response including token=secret');
    error.requestId = requestId;
    h.fake.responder = () => { throw error; };
    const response = await fetch(h.state.url);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('');
    expect(h.fake.calls.filter(call => call.path.endsWith('/contentStream'))).toHaveLength(3);
    expect(h.state.failures).toEqual([{ statusCode: 403, requestId }]);
});

test('recovers when an SDK-thrown stream denial is transient', async () => {
    const h = harness();
    await h.open();
    let attempts = 0;
    h.fake.responder = () => {
        if (++attempts === 1) { throw new GraphError(403, 'Access denied'); }
        return new Response(CONTENT);
    };
    const response = await fetch(h.state.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CONTENT);
    expect(attempts).toBe(2);
    expect(h.state.errors).toBe(0);
});

test('captures header-only Graph request IDs without exposing arbitrary response details', async () => {
    const h = harness();
    await h.open();
    const requestId = '95ddfa7b-a543-46aa-9b51-332361488ecc';
    const error = new GraphError(401, 'private response');
    error.headers = new Headers({ 'request-id': requestId, 'www-authenticate': 'private challenge' });
    h.fake.responder = () => { throw error; };
    expect((await fetch(h.state.url)).status).toBe(502);
    expect(h.state.failures).toEqual([{ statusCode: 401, requestId }]);
    error.requestId = 'https://private.example/?token=secret';
    const other = harness();
    await other.open();
    other.fake.responder = () => { throw error; };
    expect((await fetch(other.state.url)).status).toBe(502);
    expect(other.state.failures).toEqual([{ statusCode: 401, requestId: undefined }]);
});

test('permission revocation during a denied stream prevents another content attempt', async () => {
    const h = harness();
    await h.open();
    h.fake.responder = () => {
        h.state.allowed = false;
        return new Response('Access denied', { status: 403 });
    };
    expect((await fetch(h.state.url)).status).toBe(502);
    expect(h.fake.calls.filter(call => call.path.endsWith('/contentStream'))).toHaveLength(1);
    expect(h.state.errors).toBe(1);
});

test('closing a session cancels the denial backoff without retrying or reporting an error', async () => {
    const h = harness();
    await h.open();
    h.fake.responder = () => new Response('Access denied', { status: 403 });
    const denied = fetch(h.state.url).catch(() => undefined);
    await expect.poll(() => h.fake.calls.filter(call => call.path.endsWith('/contentStream')).length).toBe(1);
    h.service.closeAll();
    await denied;
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(h.fake.calls.filter(call => call.path.endsWith('/contentStream'))).toHaveLength(1);
    expect(h.state.errors).toBe(0);
});

test('rejects wrong paths, origins, hosts, and methods before requesting Graph content', async () => {
    const h = harness();
    await h.open();
    for (const url of [new URL('/wrong/preview.pdf', h.state.url), `${h.state.url}?extra=1`]) {
        expect((await fetch(url)).status).toBe(404);
    }
    expect((await fetch(h.state.url, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
    expect((await fetch(h.state.url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    expect((await fetch(h.state.url, { method: 'POST' })).status).toBe(405);
    const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest(h.state.url, { headers: { Host: 'untrusted.example' } }, response => {
            response.resume();
            resolve(response.statusCode);
        });
        request.once('error', reject);
        request.end();
    });
    expect(status).toBe(404);
    expect(h.fake.calls).toHaveLength(1);
});

test('revoked permissions, a changed identity, and expiration cannot redeem the local URL', async () => {
    const h = harness();
    await h.open();
    h.state.allowed = false;
    expect((await fetch(h.state.url)).status).toBe(502);
    h.state.allowed = true;
    h.state.identity = 'other-tenant:other-account';
    expect((await fetch(h.state.url)).status).toBe(502);
    h.state.identity = 'tenant:account';
    const now = Date.now;
    try {
        Date.now = () => now() + 6 * 60 * 1000;
        expect((await fetch(h.state.url)).status).toBe(502);
    } finally {
        Date.now = now;
    }
    expect(h.fake.calls).toHaveLength(1);
});

test('rejects redirects, unexpected range responses, and errors without exposing upstream details', async () => {
    const h = harness();
    await h.open();
    for (const status of [302, 401, 403]) {
        const callsBefore = h.fake.calls.length;
        h.fake.responder = () => new Response('private upstream details', {
            status, headers: { Location: 'https://contoso.sharepoint.com/never-redeem?token=secret' },
        });
        const response = await fetch(h.state.url, { redirect: 'manual' });
        expect(response.status).toBe(502);
        expect(response.headers.get('location')).toBeNull();
        expect(await response.text()).toBe('');
        expect(h.fake.calls.length - callsBefore).toBe(status === 403 ? 3 : 1);
    }
    h.fake.responder = () => new Response('wrong range', {
        status: 206, headers: { 'Content-Range': `bytes 6-10/${CONTENT.length}` },
    });
    expect((await fetch(h.state.url, { headers: { Range: 'bytes=0-4' } })).status).toBe(502);
    expect(h.state.errors).toBe(1);
    expect(h.fake.calls.every(call => !call.path.startsWith('http'))).toBe(true);
});

test('refuses non-PDF/malware metadata and disposes a listener when the browser cannot open', async () => {
    const h = harness();
    for (const item of [
        { ...metadata, file: { mimeType: 'text/html' } },
        { ...metadata, malware: {} },
    ]) {
        h.fake.responder = () => item;
        await expect(h.open()).rejects.toThrow('not an available PDF');
        expect(h.state.url).toBe('');
    }
    h.fake.responder = () => metadata;
    await expect(h.service.open('d1', 'i1', h.authorize, async url => {
        h.state.url = url;
        return false;
    }, () => undefined)).rejects.toThrow('browser could not open');
    await expect(fetch(h.state.url)).rejects.toThrow();
});

test('closing sessions aborts an in-flight Graph stream, cancels its reader, and closes the listener', async () => {
    const h = harness();
    await h.open();
    let cancelled = false;
    h.fake.responder = () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode(CONTENT.slice(0, 8))); },
        cancel() { cancelled = true; },
    }));
    const response = await fetch(h.state.url);
    const rejected = expect(response.arrayBuffer()).rejects.toThrow();
    const signal = h.fake.last.options?.signal;
    h.service.closeAll();
    await rejected;
    await expect.poll(() => cancelled).toBe(true);
    expect(signal).toBeInstanceOf(AbortSignal);
    if (signal instanceof AbortSignal) { expect(signal.aborted).toBe(true); }
    await expect(fetch(h.state.url)).rejects.toThrow();
});

test('invalidates an open still awaiting metadata when authentication resets', async () => {
    const h = harness();
    let resolve!: (value: typeof metadata) => void;
    h.fake.responder = () => new Promise<typeof metadata>(done => { resolve = done; });
    const opening = h.open();
    await expect.poll(() => h.fake.calls.length).toBe(1);
    h.service.closeAll();
    resolve(metadata);
    await expect(opening).rejects.toThrow('expired or the account changed');
    expect(h.state.url).toBe('');
});

test('stops streaming before emitting bytes acquired after an account switch', async () => {
    const h = harness();
    await h.open();
    let producer!: ReadableStreamDefaultController<Uint8Array>;
    h.fake.responder = () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            producer = controller;
            controller.enqueue(new TextEncoder().encode(CONTENT.slice(0, 8)));
        },
    }));
    const response = await fetch(h.state.url);
    const rejected = expect(response.arrayBuffer()).rejects.toThrow();
    h.state.identity = 'other-tenant:other-account';
    producer.enqueue(new TextEncoder().encode(CONTENT.slice(8)));
    await rejected;
});

test('incomplete PDF bodies fail instead of appearing to be successful responses', async () => {
    const h = harness();
    await h.open();
    h.fake.responder = () => new Response(CONTENT.slice(0, 8));
    await expect(async () => {
        const response = await fetch(h.state.url);
        await response.arrayBuffer();
    }).rejects.toThrow();
    expect(h.state.errors).toBe(1);
});
