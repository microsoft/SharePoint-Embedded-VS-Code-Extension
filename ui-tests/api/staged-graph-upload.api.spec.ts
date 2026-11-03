/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Blob } from 'buffer';
import type { Client } from '@microsoft/microsoft-graph-client';
import {
    GRAPH_UPLOAD_LIMIT, GraphUploadTarget, StagedGraphUploadService, StagedUploadFile,
} from '../../src/services/StorageExplorer/StagedGraphUploadService';
import { createTemporaryGraphUpload } from '../../src/services/StorageExplorer/temporaryGraphUpload';
import { DriveGraphService } from '../../src/services/StorageExplorer/DriveGraphService';
import { UPLOAD_CHUNK_SIZE } from '../../src/services/StorageExplorer/UploadSessionService';
import { OPERATION_SCHEMAS } from '../../src/services/StorageExplorer/operationSchemas';
import { FakeGraphClient } from './fakeClient';

const target: GraphUploadTarget = {
    driveId: 'd1', parentId: null, fileName: 'large.mp4', contentType: 'video/mp4', size: 3,
};
const item = { id: 'uploaded', name: 'large.mp4', kind: 'file' as const, type: 'MP4 File', size: '3 B', modifiedAt: '' };

function harness() {
    let identity = 'tenant:account';
    const writes: number[] = [];
    let uploads = 0;
    let disposals = 0;
    const file: StagedUploadFile = {
        append: async bytes => { writes.push(bytes.length); },
        upload: async () => { uploads++; return item; },
        dispose: async () => { disposals++; },
    };
    const service = new StagedGraphUploadService(() => identity, async () => file);
    return {
        service, file, writes,
        setIdentity: (value: string) => { identity = value; },
        counts: () => ({ uploads, disposals }),
    };
}

test('150,000,000 bytes are staged in bounded chunks and streamed in one Graph PUT', async () => {
    const fake = new FakeGraphClient();
    let body: Blob | undefined;
    let received = 0;
    fake.responder = async call => {
        expect(call.body).toBeInstanceOf(Blob);
        if (!(call.body instanceof Blob)) { throw new Error('Expected file-backed Blob'); }
        body = call.body;
        const reader = body.stream().getReader();
        while (true) {
            const result = await reader.read();
            if (result.done) { break; }
            received += result.value.byteLength;
            expect(result.value[0]).toBe(0x5a);
            expect(result.value[result.value.byteLength - 1]).toBe(0x5a);
        }
        return { id: 'uploaded', name: 'large.mp4', size: received, file: { mimeType: 'video/mp4' } };
    };
    let sharePointTokens = 0;
    const drive = new DriveGraphService(fake as unknown as Client, {
        getIdentity: () => 'tenant:account',
        acquireToken: async () => { sharePointTokens++; throw new Error('Must not request a SharePoint token'); },
        createStagingFile: () => createTemporaryGraphUpload(fake as unknown as Client),
    });
    const total = 150_000_000;
    const id = await drive.createUploadSession('d1', null, 'large.mp4', total, 'video/mp4');
    expect(fake.calls).toHaveLength(0);
    const bytes = new Uint8Array(UPLOAD_CHUNK_SIZE).fill(0x5a);
    let chunks = 0;
    try {
        for (let offset = 0; offset < total; offset += bytes.length) {
            const end = Math.min(offset + bytes.length, total);
            const result = await drive.uploadChunk('d1', id, offset, total, bytes.subarray(0, end - offset));
            expect(result.done).toBe(end === total);
            expect(result.nextOffset).toBe(end);
            if (result.done) { expect(result.item?.sizeBytes).toBe(total); }
            chunks++;
        }
        expect(chunks).toBe(26);
        expect(received).toBe(total);
        expect(fake.calls).toHaveLength(1);
        expect(fake.last).toMatchObject({
            method: 'PUT', path: '/drives/d1/root:/large.mp4:/content', headers: { 'Content-Type': 'video/mp4' },
        });
        expect(fake.last.options?.signal).toBeInstanceOf(AbortSignal);
        expect(sharePointTokens).toBe(0);
        expect(body).toBeDefined();
        if (body) {
            await expect(body.stream().getReader().read()).rejects.toThrow();
        }
    } finally {
        await drive.dispose();
    }
});

test('250 MB uses local staging; files above it retain upload sessions', async () => {
    const fake = new FakeGraphClient();
    fake.responder = () => ({ uploadUrl: 'https://contoso.sharepoint.com/uploadSession?tempauth=test' });
    const h = harness();
    const drive = new DriveGraphService(fake as unknown as Client, {
        getIdentity: () => 'account',
        createStagingFile: async () => h.file,
    });
    await drive.createUploadSession('d1', null, 'limit.bin', GRAPH_UPLOAD_LIMIT);
    expect(fake.calls).toHaveLength(0);
    await drive.createUploadSession('d1', null, 'larger.bin', GRAPH_UPLOAD_LIMIT + 1);
    expect(fake.last.path).toBe('/drives/d1/root:/larger.bin:/createUploadSession');
    await drive.dispose();
    expect(h.counts().disposals).toBe(1);
});

test('cancellation discards staged data without a Graph or SharePoint request', async () => {
    const h = harness();
    const id = await h.service.create(target);
    await h.service.uploadChunk('d1', id, 0, 3, new Uint8Array([1]));
    await h.service.cancel('d1', id);
    expect(h.counts()).toEqual({ uploads: 0, disposals: 1 });
    await expect(h.service.uploadChunk('d1', id, 1, 3, new Uint8Array([2]))).rejects.toThrow('Invalid upload session');
});

test('failed staging or Graph uploads dispose the temporary copy and retire the handle', async () => {
    for (const phase of ['append', 'upload'] as const) {
        const h = harness();
        h.file[phase] = async () => { throw new Error(`Failed ${phase}`); };
        const id = await h.service.create(target);
        await expect(h.service.uploadChunk('d1', id, 0, 3, new Uint8Array([1, 2, 3])))
            .rejects.toThrow(`Failed ${phase}`);
        expect(h.counts().disposals).toBe(1);
        expect(h.service.has(id)).toBe(false);
    }
});

test('account changes and invalid ranges fail closed and remove staged data', async () => {
    for (const mode of ['account', 'range', 'total', 'oversized'] as const) {
        const h = harness();
        const id = await h.service.create(target);
        if (mode === 'account') { h.setIdentity('different-account'); }
        await expect(h.service.uploadChunk('d1', id, mode === 'range' ? 1 : 0,
            mode === 'total' ? 4 : 3, new Uint8Array(mode === 'oversized' ? UPLOAD_CHUNK_SIZE + 1 : 3)))
            .rejects.toThrow();
        expect(h.writes).toEqual([]);
        expect(h.counts()).toEqual({ uploads: 0, disposals: 1 });
    }
});

test('handles are scoped to a drive and service instance', async () => {
    const h = harness();
    const id = await h.service.create(target);
    await expect(h.service.uploadChunk('other-drive', id, 0, 3, new Uint8Array([1]))).rejects.toThrow('Invalid upload session');
    await expect(harness().service.uploadChunk('d1', id, 0, 3, new Uint8Array([1]))).rejects.toThrow('Invalid upload session');
    await h.service.dispose();
    expect(h.counts().disposals).toBe(1);
});

test('cancelling an active final PUT aborts it and waits before deleting staged data', async () => {
    const h = harness();
    h.file.upload = async (_target, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
    const id = await h.service.create(target);
    const upload = h.service.uploadChunk('d1', id, 0, 3, new Uint8Array([1, 2, 3]));
    const failed = expect(upload).rejects.toThrow('Aborted');
    await expect.poll(() => h.writes.length).toBe(1);
    await h.service.cancel('d1', id);
    await failed;
    expect(h.counts().disposals).toBe(1);
});

test('panel disposal waits for cleanup already started by cancellation', async () => {
    const h = harness();
    let release = (): void => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    h.file.dispose = () => pending;
    const id = await h.service.create(target);
    const cancelled = h.service.cancel('d1', id);
    let disposed = false;
    const disposal = h.service.dispose().then(() => { disposed = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(disposed).toBe(false);
    release();
    await Promise.all([cancelled, disposal]);
    expect(disposed).toBe(true);
});

test('a cleanup failure after Graph completion explicitly warns against retrying', async () => {
    const h = harness();
    h.file.dispose = async () => { throw new Error('Disk unavailable'); };
    const id = await h.service.create(target);
    await expect(h.service.uploadChunk('d1', id, 0, 3, new Uint8Array([1, 2, 3])))
        .rejects.toThrow('The file was uploaded');
    expect(h.counts().uploads).toBe(1);
    expect(h.service.has(id)).toBe(false);
});

test('upload metadata rejects invalid sizes at the RPC boundary', () => {
    for (const fileSize of [-1, 0, 1.5, 250_000_000_001]) {
        expect(OPERATION_SCHEMAS['drive.createUploadSession'].safeParse({
            driveId: 'd1', parentId: null, fileName: 'large.bin', fileSize,
        }).success).toBe(false);
    }
});
