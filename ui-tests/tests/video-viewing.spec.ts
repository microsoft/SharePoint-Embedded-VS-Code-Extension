/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { seedState } from '../helpers/graphMock';
import { openStorageExplorer } from '../helpers/mock/harness';
import { isVideoFile } from '../../webview-ui/src/components/FileList/fileListUtils';
import type { StorageItem } from '../../webview-ui/src/models/StorageItem';

test.use({ channel: 'chromium' });

for (const name of ['Clip.MP4', 'Clip.mov', 'Clip.webm', 'Clip.mkv']) {
    test(`all ${name} preview controls open fresh, unmodified SharePoint preview URLs`, async ({ page }) => {
        const state = seedState();
        const item = state.addDriveItem(state.containers[0].id, { name });
        const previewUrl = 'https://contoso.sharepoint.com/_layouts/15/embed.aspx?example=preview';
        const previewUrls: string[] = [];
        const { view } = await openStorageExplorer(page, state);
        await page.route('https://graph.microsoft.com/v1.0/drives/*/items/*/preview', async route => {
            expect(route.request().method()).toBe('POST');
            const getUrl = `${previewUrl}-${previewUrls.length + 1}`;
            previewUrls.push(getUrl);
            await route.fulfill({ json: { getUrl } });
        });
        await view.openContainer('Seed Container');
        await view.select(item.name);
        const opened = () => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message => message.command === 'openExternal').length ?? 0);

        await view.tid('action-preview').click();
        await expect.poll(opened).toBe(1);
        await view.row(item.name).dblclick();
        await expect.poll(opened).toBe(2);
        await view.row(item.name).getByTitle('Preview', { exact: true }).click();
        await expect.poll(opened).toBe(3);
        await view.openRowMenu(item.name);
        await view.clickMenuItem('preview');
        await expect.poll(opened).toBe(4);
        await expect(view.tid('action-open-dropdown')).toBeDisabled();

        const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
        const requests = messages.filter(message => message.command === 'rpc/request' && message.op === 'drive.getPreviewUrl');
        expect(requests).toHaveLength(4);
        for (const request of requests) {
            expect(request.params).toEqual({ driveId: state.containers[0].id, itemId: item.id, hideBanner: false });
        }
        expect(messages.filter(message => message.command === 'openExternal').map(message => message.url))
            .toEqual(previewUrls);
        expect(previewUrls).toHaveLength(4);
        expect(new Set(previewUrls).size).toBe(4);
        expect(messages.some(message =>
            message.command === 'videoOpened'
            || ['drive.getItemWebUrl', 'drive.openVideo', 'drive.download'].includes(String(message.op))
        )).toBe(false);
    });
}

test('video classification supports MIME types and filename fallbacks without classifying source code as video', () => {
    const file: StorageItem = { id: 'i1', name: 'Clip', kind: 'file', modifiedAt: '', type: 'File', size: '' };
    expect(isVideoFile({ ...file, mimeType: 'VIDEO/MP4' })).toBe(true);
    expect(isVideoFile({ ...file, mimeType: 'video/quicktime; codecs=avc1' })).toBe(true);
    expect(isVideoFile({ ...file, name: 'Clip.MP4' })).toBe(true);
    expect(isVideoFile({ ...file, name: 'Clip.mov', mimeType: 'application/octet-stream' })).toBe(true);
    expect(isVideoFile({ ...file, name: 'app.ts', mimeType: 'text/typescript' })).toBe(false);
    expect(isVideoFile({ ...file, name: 'app.ts' })).toBe(false);
    expect(isVideoFile({ ...file, name: 'Clip.ts', mimeType: 'video/mp2t' })).toBe(true);
    expect(isVideoFile({ ...file, name: 'Clip.mp4', kind: 'folder' })).toBe(false);
});

test('a failed video preview does not open a URL and the next attempt requests a fresh preview', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Clip.mp4' });
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const { view } = await openStorageExplorer(page, state);
    const previewUrl = 'https://contoso.sharepoint.com/_layouts/15/embed.aspx?example=fresh';
    let attempts = 0;
    await page.route('https://graph.microsoft.com/v1.0/drives/*/items/*/preview', async route => {
        attempts++;
        await route.fulfill(attempts === 1
            ? { status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } }
            : { json: { getUrl: previewUrl } });
    });
    await view.openContainer('Seed Container');
    await view.select(item.name);
    const failed = page.waitForResponse(response => response.url().endsWith('/preview') && response.status() === 403);
    await view.tid('action-preview').click();
    await failed;
    expect(await page.evaluate(() =>
        (window.__SPE_TEST_POSTED__ ?? []).filter(message => message.command === 'openExternal')
    )).toHaveLength(0);
    await view.tid('action-preview').click();
    await expect.poll(() => page.evaluate(() =>
        (window.__SPE_TEST_POSTED__ ?? []).filter(message => message.command === 'openExternal').map(message => message.url)
    )).toEqual([previewUrl]);
    expect(attempts).toBe(2);
    expect(pageErrors).toEqual([]);
});

test('MP4 preview remains blocked without readContent', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Clip.mp4' });
    state.appPermissionGrants.set('spe-ui-test', { delegatedPermissions: ['read'], applicationPermissions: [] });
    const { view } = await openStorageExplorer(page, state);
    await view.openContainer('Seed Container');
    await view.select(item.name);
    await expect(view.tid('action-preview')).toHaveAttribute('aria-disabled', 'true');
    await view.row(item.name).dblclick();
    await expect(page.getByTestId('permission-notice')).toContainText('readContent');
    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    expect(messages.some(message =>
        ['drive.getPreviewUrl', 'drive.openVideo'].includes(String(message.op))
        || message.command === 'openExternal' || message.command === 'videoOpened'
    )).toBe(false);
});
