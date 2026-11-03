/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { seedState } from '../helpers/graphMock';
import { openStorageExplorer } from '../helpers/mock/harness';

test('all PDF viewing controls open fresh Graph preview URLs without a custom viewer or download', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Report.PDF' });
    const { view } = await openStorageExplorer(page, state);
    const previewUrls: string[] = [];
    await page.route('https://graph.microsoft.com/v1.0/drives/*/items/*/preview', async route => {
        expect(route.request().method()).toBe('POST');
        const getUrl = `https://contoso.sharepoint.com/_layouts/15/embed.aspx?preview=${previewUrls.length + 1}`;
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
    await expect(view.row(item.name).getByTitle('Open in browser', { exact: true })).toHaveCount(0);
    await view.openRowMenu(item.name);
    await expect(view.tid('context-menu-item-open-in-browser')).toHaveCount(0);
    await expect(view.tid('context-menu-item-open-in-desktop')).toHaveCount(0);

    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    const requests = messages.filter(message => message.command === 'rpc/request' && message.op === 'drive.getPreviewUrl');
    expect(requests).toHaveLength(4);
    for (const request of requests) {
        expect(request.params).toEqual({ driveId: state.containers[0].id, itemId: item.id, hideBanner: false });
    }
    expect(previewUrls).toHaveLength(4);
    expect(new Set(previewUrls).size).toBe(4);
    expect(messages.filter(message => message.command === 'openExternal').map(message => message.url)).toEqual(previewUrls);
    expect(messages.some(message =>
        message.command === 'pdfOpened'
        || ['drive.getItemWebUrl', 'drive.openPdf', 'drive.openVideo', 'drive.download'].includes(String(message.op))
    )).toBe(false);
});

test('PDF viewing remains blocked without readContent', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Report.pdf' });
    state.appPermissionGrants.set('spe-ui-test', { delegatedPermissions: ['read'], applicationPermissions: [] });
    const { view } = await openStorageExplorer(page, state);
    await view.openContainer('Seed Container');
    await view.select(item.name);
    await expect(view.tid('action-preview')).toHaveAttribute('aria-disabled', 'true');
    await view.row(item.name).dblclick();
    await expect(page.getByTestId('permission-notice')).toContainText('readContent');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await view.openRowMenu(item.name);
    await view.clickMenuItem('preview');
    await expect(page.getByTestId('permission-notice')).toContainText('readContent');
    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    expect(messages.some(message =>
        ['drive.getPreviewUrl', 'drive.openPdf'].includes(String(message.op))
        || message.command === 'openExternal' || message.command === 'pdfOpened'
    )).toBe(false);
});

test('an unsupported PDF preview never falls back to streaming and retry fetches a fresh link', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Report.pdf' });
    const { view } = await openStorageExplorer(page, state);
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let attempts = 0;
    const previewUrl = 'https://contoso.sharepoint.com/_layouts/15/embed.aspx?preview=fresh';
    await page.route('https://graph.microsoft.com/v1.0/drives/*/items/*/preview', async route => {
        attempts++;
        await route.fulfill(attempts === 1
            ? { status: 400, json: { error: { code: 'notSupported', message: 'Preview is unavailable' } } }
            : { json: { getUrl: previewUrl } });
    });
    await view.openContainer('Seed Container');
    await view.select(item.name);
    const failed = page.waitForResponse(response => response.url().endsWith('/preview') && response.status() === 400);
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
    expect(await page.evaluate(() => (window.__SPE_TEST_POSTED__ ?? []).some(message =>
        ['drive.openPdf', 'drive.openVideo', 'drive.download', 'drive.getDownloadUrl'].includes(String(message.op))
    ))).toBe(false);
});
