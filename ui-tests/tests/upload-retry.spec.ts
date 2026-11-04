/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';
const FILE_SIZE = 10 * 1024 * 1024 + 1;

test.describe('Upload retry', () => {
    for (const status of [401, 403]) {
        test(`Graph upload ${status} fails without contacting SharePoint or creating an upload session`, async ({ storage, page }) => {
            await storage.openContainer(SEED_CONTAINER);
            const destinations: string[] = [];
            page.on('request', request => { destinations.push(request.url()); });
            let puts = 0;
            await page.route(url => url.pathname.endsWith('/content'), async route => {
                expect(route.request().method()).toBe('PUT');
                expect(new URL(route.request().url()).hostname).toBe('graph.microsoft.com');
                puts++;
                await route.fulfill({
                    status,
                    json: { error: { code: 'uploadDenied', message: 'Graph upload denied' } },
                });
            });
            await storage.tid('action-upload-input').setInputFiles({
                name: 'large.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(FILE_SIZE),
            });
            await expect(storage.tid('upload-card')).toContainText('Failed');
            expect(puts).toBe(1);
            expect(destinations.some(url => url.includes('.sharepoint.com') || url.includes('createUploadSession'))).toBe(false);

            await storage.tid('nav-network-toggle').click();
            await storage.tid('network-export-har').click();
            const har = await page.evaluate(() => {
                const message = window.__SPE_TEST_POSTED__?.find(entry => entry.command === 'exportHar');
                return typeof message?.har === 'string' ? message.har : '';
            });
            expect(har).not.toContain('TEST-ONLY-SHAREPOINT-TOKEN');
            expect(har.toLowerCase()).not.toContain('"authorization"');
            const entry = JSON.parse(har).log.entries.find(
                (request: { request: { method: string } }) => request.request.method === 'PUT'
            );
            expect(entry.response.status).toBe(status);
        });
    }

    test('Graph-only upload stages bounded RPC chunks and completes with one PUT', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);
        const destinations: string[] = [];
        page.on('request', request => { destinations.push(request.url()); });
        let puts = 0;
        let release = (): void => {};
        const sending = new Promise<void>(resolve => { release = resolve; });
        await page.route(url => url.pathname.endsWith('/content'), async route => {
            expect(new URL(route.request().url()).hostname).toBe('graph.microsoft.com');
            expect(route.request().postDataBuffer()?.length).toBe(FILE_SIZE);
            expect(route.request().headers()['content-range']).toBeUndefined();
            puts++;
            await sending;
            await route.fulfill({
                status: 201,
                json: { id: 'completed-large-file', name: 'large.mp4', size: FILE_SIZE, file: { mimeType: 'video/mp4' } },
            });
        });
        await storage.tid('action-upload-input').setInputFiles({
            name: 'large.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(FILE_SIZE),
        });
        try {
            await expect.poll(() => puts).toBe(1);
            await expect(storage.tid('upload-item-large.mp4')).toContainText('Uploading');
            await expect(storage.tid('upload-pause')).toHaveCount(0);
            await expect(storage.tid('upload-cancel')).toBeVisible();
        } finally {
            release();
        }
        await expect(storage.tid('upload-card')).toContainText('Done');
        expect(puts).toBe(1);
        expect(destinations.some(url => url.includes('.sharepoint.com') || url.includes('createUploadSession'))).toBe(false);
        await expect(storage.tid('file-row-large.mp4')).toBeVisible();
        const chunks = await page.evaluate(() => (window.__SPE_TEST_POSTED__ ?? [])
            .filter(entry => entry.op === 'drive.uploadChunk')
            .map(entry => {
                const params = entry.params as { sessionId: string; bytes: Uint8Array };
                return { sessionId: params.sessionId, size: params.bytes.byteLength, keys: Object.keys(params) };
            }));
        expect(chunks.map(chunk => chunk.size)).toEqual([5898240, 4587521]);
        expect(chunks[0].sessionId).toMatch(/^[a-f0-9-]{36}$/);
        expect(chunks[1].sessionId).toBe(chunks[0].sessionId);
        expect(chunks[0].keys).not.toContain('uploadUrl');
    });

    for (const action of ['resume', 'cancel', 'resume immediately'] as const) {
        test(`a locally staged upload can ${action}`, async ({ storage, page }) => {
            await page.addInitScript(() => {
                let held: unknown;
                let intercepted = false;
                const gate = (event: MessageEvent) => {
                    if (intercepted || event.data?.command !== 'rpc/response') { return; }
                    const request = window.__SPE_TEST_POSTED__?.find(message =>
                        message.requestId === event.data.requestId && message.op === 'drive.uploadChunk');
                    if (!request) { return; }
                    intercepted = true;
                    held = event.data;
                    event.stopImmediatePropagation();
                };
                window.addEventListener('message', gate, true);
                document.addEventListener('release-upload-chunk', () => {
                    window.removeEventListener('message', gate, true);
                    window.dispatchEvent(new MessageEvent('message', { data: held }));
                }, { once: true });
            });
            await page.reload();
            await storage.openContainer(SEED_CONTAINER);
            let puts = 0;
            await page.route(url => url.pathname.endsWith('/content'), async route => {
                puts++;
                await route.fulfill({ status: 201, json: { id: 'completed-large-file' } });
            });
            await storage.tid('action-upload-input').setInputFiles({
                name: 'large.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(FILE_SIZE),
            });
            await expect.poll(() => page.evaluate(() => (window.__SPE_TEST_POSTED__ ?? [])
                .filter(message => message.op === 'drive.uploadChunk').length)).toBe(1);
            await expect(storage.tid('upload-item-large.mp4')).toContainText('Preparing');
            await storage.tid('upload-pause').click();
            if (action === 'resume immediately') {
                await storage.tid('upload-resume').click();
            }
            await page.evaluate(() => document.dispatchEvent(new Event('release-upload-chunk')));
            const row = storage.tid('upload-item-large.mp4');
            if (action !== 'resume immediately') {
                await expect(row).toContainText('Paused');
                await expect(row).toContainText('5.6 MB / 10.0 MB');
                expect(puts).toBe(0);
                await storage.tid(`upload-${action}`).click();
            }
            if (action !== 'cancel') {
                await expect(row).toContainText('Done');
                expect(puts).toBe(1);
                expect(await page.evaluate(() => (window.__SPE_TEST_POSTED__ ?? [])
                    .filter(entry => entry.op === 'drive.uploadChunk').length)).toBe(2);
            } else {
                await expect(row).toHaveCount(0);
                await expect.poll(() => page.evaluate(() => (window.__SPE_TEST_POSTED__ ?? [])
                    .filter(message => message.op === 'drive.cancelUploadSession').length)).toBe(1);
                expect(puts).toBe(0);
            }
        });
    }

    test('retry replaces a failed staged upload and sends the whole file again', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);
        let puts = 0;
        await page.route(url => url.pathname.endsWith('/content'), async route => {
            expect(route.request().postDataBuffer()?.length).toBe(FILE_SIZE);
            puts++;
            if (puts === 1) {
                await route.fulfill({ status: 401, json: { error: { code: 'unauthenticated', message: 'Unauthenticated' } } });
            } else {
                await route.fulfill({ status: 201, json: { id: 'retried-large-file' } });
            }
        });
        await storage.tid('action-upload-input').setInputFiles({
            name: 'large.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(FILE_SIZE),
        });
        await expect(storage.tid('upload-item-large.mp4')).toContainText('Failed');
        await storage.tid('upload-retry').click();
        await expect(storage.tid('upload-item-large.mp4')).toContainText('Done');
        expect(puts).toBe(2);
        const handles = await page.evaluate(() => (window.__SPE_TEST_POSTED__ ?? [])
            .filter(message => message.op === 'drive.uploadChunk')
            .map(message => (message.params as { sessionId: string }).sessionId));
        expect(handles).toHaveLength(4);
        expect(handles[0]).toBe(handles[1]);
        expect(handles[2]).toBe(handles[3]);
        expect(handles[2]).not.toBe(handles[0]);
    });

    test('"Retry all" re-runs every failed upload', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);
        let failMode = true;
        await page.route(url => url.pathname.endsWith('/content'), async route => {
            await route.fulfill(failMode
                ? { status: 500, json: { error: { code: 'serverError', message: 'boom' } } }
                : { status: 201, json: { id: `up-${Math.random().toString(36).slice(2)}`, name: 'x', size: 3, file: { mimeType: 'text/plain' } } });
        });
        await storage.tid('action-upload-input').setInputFiles([
            { name: 'up1.txt', mimeType: 'text/plain', buffer: Buffer.from('one') },
            { name: 'up2.txt', mimeType: 'text/plain', buffer: Buffer.from('two') },
        ]);
        await expect(storage.tid('upload-card')).toBeVisible({ timeout: 15_000 });
        await expect(storage.tid('upload-retry-all')).toBeVisible({ timeout: 15_000 });
        failMode = false;
        await storage.tid('upload-retry-all').click();
        await expect(storage.tid('upload-retry-all')).toHaveCount(0, { timeout: 15_000 });
    });
});
