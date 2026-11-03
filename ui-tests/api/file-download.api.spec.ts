/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileDownloadService } from '../../src/services/StorageExplorer/FileDownloadService';
import { saveDownloadedFile } from '../../src/services/StorageExplorer/saveDownloadedFile';
import { StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import { OPERATION_SCHEMAS } from '../../src/services/StorageExplorer/operationSchemas';
import { FakeGraphClient } from './fakeClient';
import { NetworkLoggingMiddleware } from '../../src/services/StorageExplorer/NetworkLoggingMiddleware';
import type { NetworkRequest } from '../../src/services/StorageExplorer/protocol';

const plainUrl = 'https://contoso.sharepoint.com/_layouts/15/download.aspx?UniqueId=file-id&Translate=false&ApiVersion=2.0';
const identity = 'tenant:account';

test('streams a 150 MB Graph download to disk with identical bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'spe-download-test-'));
    const destination = join(directory, 'video.mp4');
    const size = 150_000_000;
    const expectedHash = createHash('sha256');
    let remaining = size;
    let calls = 0;
    const service = new FileDownloadService({ getIdentity: () => identity });
    const open = async () => {
        calls++;
        return new Response(new ReadableStream<Uint8Array>({
            pull(controller) {
                if (!remaining) { controller.close(); return; }
                const chunk = new Uint8Array(Math.min(remaining, 1024 * 1024)).fill(0x5a);
                expectedHash.update(chunk);
                remaining -= chunk.length;
                controller.enqueue(chunk);
            },
        }));
    };
    try {
        await saveDownloadedFile(destination,
            signal => service.readGraph(open, size, identity, signal), new AbortController().signal);
        expect((await stat(destination)).size).toBe(size);
        const actualHash = createHash('sha256');
        for await (const chunk of createReadStream(destination)) { actualHash.update(chunk); }
        expect(actualHash.digest('hex')).toBe(expectedHash.digest('hex'));
        expect(calls).toBe(1);
        expect(await readdir(directory)).toEqual(['video.mp4']);
    } finally {
        service.dispose();
        await rm(directory, { recursive: true, force: true });
    }
});

for (const failure of ['denied', 'truncated', 'interrupted', 'cancelled', 'redirected']) {
    test(`does not overwrite an existing file or leave partial downloads when ${failure}`, async () => {
        const directory = await mkdtemp(join(tmpdir(), 'spe-download-test-'));
        const destination = join(directory, 'existing.mp4');
        const controller = new AbortController();
        const service = new FileDownloadService({ getIdentity: () => identity });
        const open = async () => {
            if (failure === 'denied') { return new Response('Access denied', { status: 403 }); }
            if (failure === 'redirected') { return new Response(null, { status: 302, headers: { Location: plainUrl } }); }
            return new Response(new ReadableStream<Uint8Array>({
                start(stream) {
                    stream.enqueue(new Uint8Array([1, 2]));
                    if (failure === 'interrupted') { stream.error(new Error('sensitive-url-must-not-leak')); }
                    else if (failure === 'cancelled') { controller.abort(); }
                    else { stream.close(); }
                },
            }));
        };
        try {
            await writeFile(destination, 'original');
            const saving = saveDownloadedFile(destination,
                signal => service.readGraph(open, 3, identity, signal), controller.signal);
            if (failure === 'denied') {
                await expect(saving).rejects.toMatchObject({ statusCode: 403, code: 'accessDenied' });
            } else if (failure === 'interrupted') {
                await expect(saving).rejects.toThrow('The file download was interrupted. Retry the download.');
            } else {
                await expect(saving).rejects.toThrow();
            }
            expect(await readFile(destination, 'utf8')).toBe('original');
            expect(await readdir(directory)).toEqual(['existing.mp4']);
        } finally {
            service.dispose();
            await rm(directory, { recursive: true, force: true });
        }
    });
}

test('rejects account switches before requesting content and while streaming', async () => {
    let currentIdentity = identity;
    let requests = 0;
    const service = new FileDownloadService({ getIdentity: () => currentIdentity });
    const consume = async () => {
        for await (const _chunk of service.readGraph(async () => {
            requests++;
            currentIdentity = 'different-account';
            return new Response(new Uint8Array([1, 2, 3]));
        }, 3, identity, new AbortController().signal)) { /* consume */ }
    };
    currentIdentity = 'different-account';
    await expect(consume()).rejects.toThrow('account changed');
    expect(requests).toBe(0);
    currentIdentity = identity;
    await expect(consume()).rejects.toThrow('account changed');
    expect(requests).toBe(1);
});

test('the save operation requires readContent and validates identifiers before Graph or disk access', async () => {
    const fake = new FakeGraphClient();
    const api = new StorageExplorerApi('ct1', fake as unknown as Client, async () => ['read']);
    let saves = 0;
    const context = { onProgress: () => {}, saveDownload: async () => { saves++; } };
    await expect(api.execute('drive.download', { driveId: 'd1', itemId: 'i1' }, context))
        .rejects.toMatchObject({ code: 'missingExtensionAppPermissions', requiredScopes: ['readContent'] });
    expect(fake.calls).toHaveLength(0);
    expect(saves).toBe(0);
    expect(OPERATION_SCHEMAS['drive.download'].safeParse({ driveId: 'd1', itemId: '../other' }).success).toBe(false);
    await api.dispose();
});

test('cancelled Save As fetches fresh metadata but neither redeems nor returns a download URL', async () => {
    const fake = new FakeGraphClient();
    fake.responder = call => call.path.includes('/storage/fileStorage/containers/')
        ? { containerTypeId: 'ct1' }
        : { name: 'video.mp4', size: 150_000_000, file: {}, '@microsoft.graph.downloadUrl': plainUrl };
    let acquisitions = 0;
    const api = new StorageExplorerApi('ct1', fake as unknown as Client, async () => ['readContent'], undefined, {
        getIdentity: () => identity,
        acquireToken: async () => { acquisitions++; return 'test-only-token'; },
    });
    let saves = 0;
    const result = await api.execute('drive.download', { driveId: 'd1', itemId: 'i1' }, {
        onProgress: () => {},
        saveDownload: async name => { expect(name).toBe('video.mp4'); saves++; },
    });
    expect(result).toBeUndefined();
    expect(acquisitions).toBe(0);
    expect(saves).toBe(1);
    expect(fake.last).toMatchObject({
        path: '/drives/d1/items/i1', method: 'GET', select: 'name,size,file',
    });
    await api.dispose();
});

test('streams beta Graph contentStream directly without requesting a SharePoint token', async () => {
    const fake = new FakeGraphClient();
    fake.responder = call => {
        if (call.path.includes('/storage/fileStorage/containers/')) { return { containerTypeId: 'ct1' }; }
        if (call.path.endsWith('/contentStream')) { return new Response(new Uint8Array([0, 255, 13, 10])); }
        return { name: 'data.bin', size: 4, file: {} };
    };
    const api = new StorageExplorerApi('ct1', fake as unknown as Client, async () => ['readContent'], undefined, {
        getIdentity: () => identity,
        acquireToken: async () => { throw new Error('A direct Graph download must not acquire a SharePoint token'); },
    });
    const bytes: number[] = [];
    try {
        await api.execute('drive.download', { driveId: 'd1', itemId: 'i1' }, {
            onProgress: () => {},
            saveDownload: async (name, source) => {
                expect(name).toBe('data.bin');
                for await (const chunk of source(new AbortController().signal)) { bytes.push(...chunk); }
            },
        });
        expect(bytes).toEqual([0, 255, 13, 10]);
        expect(fake.last).toMatchObject({
            method: 'GET', path: '/drives/d1/items/i1/contentStream', version: 'beta', responseType: 'raw',
            middlewareOptions: [{ maxRedirects: 0 }],
        });
    } finally {
        await api.dispose();
    }
});

for (const suffix of ['', '&tempauth=sensitive-value']) {
    test(`rejects Graph redirects without following or exposing the destination: ${suffix ? 'preauthenticated' : 'plain'}`, async () => {
        const fake = new FakeGraphClient();
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
        fake.responder = call => {
            if (call.path.includes('/storage/fileStorage/containers/')) { return { containerTypeId: 'ct1' }; }
            if (call.path.endsWith('/contentStream')) {
                return new Response(body, { status: 302, headers: { Location: plainUrl + suffix } });
            }
            return { name: 'data.bin', size: 1, file: {} };
        };
        let acquisitions = 0;
        const api = new StorageExplorerApi('ct1', fake as unknown as Client, async () => ['readContent'], undefined, {
            getIdentity: () => identity,
            acquireToken: async () => { acquisitions++; throw new Error('Must not acquire a SharePoint token'); },
        });
        try {
            await expect(api.execute('drive.download', { driveId: 'd1', itemId: 'i1' }, {
                onProgress: () => {},
                saveDownload: async (_name, source) => {
                    for await (const _chunk of source(new AbortController().signal)) { /* consume */ }
                },
            })).rejects.toThrow('Microsoft Graph returned a redirect instead of file content.');
            expect(acquisitions).toBe(0);
            expect(cancelled).toBe(true);
            expect(fake.calls.every(call => !call.path.includes('sharepoint.com'))).toBe(true);
            expect(fake.last.path).toBe('/drives/d1/items/i1/contentStream');
        } finally {
            await api.dispose();
        }
    });
}

for (const endpoint of ['v1.0/drives/d1/items/i1/content', 'beta/drives/d1/items/i1/contentStream']) {
    test(`network logging never clones, buffers, or exposes downloaded file content: ${endpoint}`, async () => {
        const logs: NetworkRequest[] = [];
        const middleware = new NetworkLoggingMiddleware(entry => logs.push(entry));
        let clones = 0;
        await middleware.execute({
            request: `https://graph.microsoft.com/${endpoint}`,
            options: { method: 'GET', headers: { Authorization: 'Bearer test-only-token' } },
            response: {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
                clone() { clones++; throw new Error('Must not clone file content'); },
            },
        });
        expect(clones).toBe(0);
        expect(logs).toHaveLength(1);
        expect(logs[0].responseBody).toBe('[File download body omitted]');
        expect(JSON.stringify(logs)).not.toContain('test-only-token');
    });
}
