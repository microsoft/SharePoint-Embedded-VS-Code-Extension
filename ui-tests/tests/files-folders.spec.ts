/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import { readFile } from 'fs/promises';

const SEED_CONTAINER = 'Seed Container';

test.describe('Files & folders', () => {
    test('navigate into a container and see seeded items', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        // The seed adds a "Folder 1" and a couple of files.
        await expect(storage.row('Folder 1')).toBeVisible({ timeout: 30_000 });
    });

    test('opens the fresh file webUrl from all browser actions and keeps Preview separate', async ({ storage, page }) => {
        const webUrl = 'https://contoso.sharepoint.com/:w:r/contentstorage/site/_layouts/15/doc2.aspx?sourcedoc=file-id&file=File%202.docx&action=default&mobileredirect=true';
        await page.route('https://graph.microsoft.com/v1.0/drives/*/items/*', async route => {
            if (new URL(route.request().url()).searchParams.get('$select') !== 'webUrl') {
                await route.fallback();
                return;
            }
            await route.fulfill({ json: { webUrl } });
        });
        await storage.openContainer(SEED_CONTAINER);
        await storage.select('File 2.docx');
        const itemId = await storage.row('File 2.docx').getAttribute('data-item-id');

        await expect(storage.tid('action-open-dropdown')).toBeEnabled();
        await storage.tid('action-open-dropdown').click();
        await storage.tid('action-open-web').click();
        await expect.poll(() => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message => message.command === 'openExternal').length ?? 0
        )).toBe(1);

        await storage.openRowMenu('File 2.docx');
        await storage.clickMenuItem('open-in-browser');
        await expect.poll(() => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message => message.command === 'openExternal').length ?? 0
        )).toBe(2);

        await storage.row('File 2.docx').getByTitle('Open in browser', { exact: true }).click();
        await expect.poll(() => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message => message.command === 'openExternal').length ?? 0
        )).toBe(3);

        await storage.row('File 2.docx').dblclick();
        await expect.poll(() => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message => message.command === 'openExternal').length ?? 0
        )).toBe(4);

        const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
        expect(messages.filter(message => message.command === 'openExternal').map(message => message.url))
            .toEqual([webUrl, webUrl, webUrl, webUrl]);
        const browserRequests = messages.filter(message =>
            message.command === 'rpc/request' && message.op === 'drive.getItemWebUrl'
        );
        expect(browserRequests).toHaveLength(4);
        for (const request of browserRequests) {
            expect(request.params).toMatchObject({ itemId });
        }
        expect(messages.some(message => message.op === 'drive.getPreviewUrl')).toBe(false);

        await storage.tid('action-preview').click();
        await expect.poll(() => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message =>
                message.command === 'rpc/request' && message.op === 'drive.getPreviewUrl'
            ).length ?? 0
        )).toBe(1);
        await expect.poll(() => page.evaluate(() =>
            window.__SPE_TEST_POSTED__?.filter(message => message.command === 'openExternal').length ?? 0
        )).toBe(5);
    });

    test('non-Office files have Preview but no Office open actions', async ({ storage, page }) => {
        await page.route(url => url.pathname.endsWith('/children'), route => route.fulfill({
            json: { value: [
                { id: 'video', name: 'Clip.mp4', file: { mimeType: 'video/mp4' } },
                { id: 'text', name: 'Notes.txt', file: { mimeType: 'text/plain' } },
                { id: 'macro', name: 'Report.DOCM', file: { mimeType: 'application/vnd.ms-word.document.macroEnabled.12' } },
                { id: 'folder', name: 'Folder', folder: {} },
            ] },
        }));
        await storage.openContainer(SEED_CONTAINER);
        for (const name of ['Clip.mp4', 'Notes.txt']) {
            await storage.select(name);
            await expect(storage.tid('action-open-dropdown')).toBeDisabled();
            await expect(storage.tid('action-preview')).toBeEnabled();
            await expect(storage.row(name).getByTitle('Open in browser', { exact: true })).toHaveCount(0);
            await storage.openRowMenu(name);
            await expect(storage.tid('context-menu-item-open-in-browser')).toHaveCount(0);
            await expect(storage.tid('context-menu-item-open-in-desktop')).toHaveCount(0);
            await expect(storage.tid('context-menu-item-preview')).toBeVisible();
            await page.keyboard.press('Escape');
        }
        await storage.select('Report.DOCM');
        await expect(storage.tid('action-open-dropdown')).toBeEnabled();
        await storage.select('Folder');
        await expect(storage.tid('action-open-dropdown')).toBeDisabled();
    });

    test('selected row actions inherit the selection foreground in a light theme', async ({ storage, page }) => {
        await page.evaluate(() => {
            document.body.style.setProperty('--vscode-list-activeSelectionBackground', '#0060c0');
            document.body.style.setProperty('--vscode-list-activeSelectionForeground', '#ffffff');
            document.body.style.setProperty('--vscode-icon-foreground', '#424242');
            document.body.style.setProperty('--vscode-foreground', '#202020');
        });
        await storage.openContainer(SEED_CONTAINER);
        await storage.select('File 2.docx');
        const row = storage.row('File 2.docx');
        const action = row.getByTitle('Preview', { exact: true });
        await row.locator('input').hover();
        await expect(action).toHaveCSS('color', 'rgb(255, 255, 255)');
        await action.hover();
        await expect(action).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(action).toHaveCSS('color', 'rgb(0, 96, 192)');
    });

    test('create a new folder', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        const folder = `NewFolder-${Date.now()}`;
        await storage.newFolder(folder);
        await expect(storage.row(folder)).toBeVisible();
    });

    test('Download saves authenticated file bytes instead of opening a SharePoint browser page', async ({ storage, page }) => {
        const content = Buffer.alloc(1024, 0x5a);
        await page.route('https://graph.microsoft.com/beta/drives/*/items/*/contentStream', async route => {
            expect(route.request().headers().authorization).toMatch(/^Bearer /);
            await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: content });
        });
        await storage.openContainer(SEED_CONTAINER);
        await storage.select('File 2.docx');
        const downloaded = page.waitForEvent('download');
        await storage.tid('action-download').click();
        const download = await downloaded;
        expect(download.suggestedFilename()).toBe('File 2.docx');
        const path = await download.path();
        expect(path).not.toBeNull();
        expect(await readFile(path!)).toEqual(content);
        const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
        expect(messages.some(message => message.op === 'drive.download')).toBe(true);
        expect(messages.some(message => message.command === 'openExternal')).toBe(false);
        expect(messages.some(message => message.op === 'drive.getDownloadUrl')).toBe(false);
    });

    test('create a new Word document', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);
        const base = `Doc-${Date.now()}`;
        await storage.newWordFile(base);
        // Extension may be appended (.docx) — match by prefix.
        await expect(page.locator(`[data-testid^="file-row-${base}"]`)).toBeVisible();
    });

    test('rename an item', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        const folder = `RenMe-${Date.now()}`;
        const renamed = `${folder}-done`;
        await storage.newFolder(folder);
        await storage.renameItem(folder, renamed);
        await expect(storage.row(renamed)).toBeVisible();
        await expect(storage.row(folder)).toHaveCount(0);
    });

    test('delete an item', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        const folder = `DelMe-${Date.now()}`;
        await storage.newFolder(folder);
        await storage.deleteItem(folder);
        await expect(storage.row(folder)).toHaveCount(0);
    });

    test('breadcrumb navigates back to the container list', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await expect(storage.row('Folder 1')).toBeVisible({ timeout: 30_000 });
        await storage.breadcrumbTo(0);
        await expect(storage.row(SEED_CONTAINER)).toBeVisible({ timeout: 30_000 });
    });
});
