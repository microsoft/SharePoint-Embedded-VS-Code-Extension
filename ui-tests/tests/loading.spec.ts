/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import { TID } from '../testids';

const SEED_CONTAINER = 'Seed Container';

/** Build N fake drive-item objects Graph-style. */
function items(start: number, n: number) {
    return Array.from({ length: n }, (_, i) => ({
        id: `f${start + i}`,
        name: `File ${start + i}.txt`,
        size: 10,
        createdDateTime: new Date().toISOString(),
        lastModifiedDateTime: new Date().toISOString(),
        webUrl: 'https://contoso.sharepoint.com/x',
        file: { mimeType: 'text/plain' },
    }));
}

test.describe('Loading progress', () => {
    test('shows a loading indicator for the first page and then stops, leaving page 2 to Load more', async ({ storage, page }) => {
        // Override the drive children endpoint with a SLOW, two-page response so the loading
        // indicator is observable. This route is registered after the fixture's mock, so it wins.
        let pageRequests = 0;
        await page.route((url) => url.pathname.endsWith('/children'), async (route) => {
            await new Promise(r => setTimeout(r, 1200));
            const url = route.request().url();
            pageRequests += 1;
            const body = url.includes('skiptoken')
                ? { value: items(50, 50) }
                // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
                : { value: items(0, 50), '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/x/root/children?$skiptoken=PAGE2' };
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });

        await storage.openContainer(SEED_CONTAINER);

        // The loading banner appears while page 1 is in flight...
        await expect(storage.tid('list-loading')).toBeVisible();
        // No result-derived state may render until the request settles.
        await expect(storage.tid('filelist-empty')).toHaveCount(0);
        await expect(storage.row('File 0.txt')).toHaveCount(0);
        // ...and disappears once that page has landed.
        await expect(storage.tid('list-loading')).toHaveCount(0, { timeout: 15_000 });

        // Only the first page was fetched: a page-2 item is absent, and filtering does not
        // silently reach for it.
        expect(pageRequests).toBe(1);
        await storage.search('File 99.txt');
        await expect(storage.row('File 99.txt')).toHaveCount(0);
        expect(pageRequests).toBe(1);
        await storage.clearSearch();

        // Page 2 arrives only when the user asks for it.
        await storage.loadMore();
        expect(pageRequests).toBe(2);
        await storage.search('File 99.txt');
        await expect(storage.row('File 99.txt')).toBeVisible({ timeout: 15_000 });
    });

    test('hides cached containers while the root refresh is in flight', async ({ storage, page }) => {
        await page.route((url) => url.pathname.endsWith('/storage/fileStorage/containers'), async (route) => {
            await new Promise(r => setTimeout(r, 800));
            await route.fallback();
        });

        await storage.tid(TID.navRefresh).click();

        await expect(storage.tid(TID.listLoading)).toBeVisible();
        await expect(storage.row(SEED_CONTAINER)).toHaveCount(0);
        await expect(storage.tid(TID.fileListEmpty)).toHaveCount(0);

        await expect(storage.tid(TID.listLoading)).toHaveCount(0, { timeout: 15_000 });
        await expect(storage.row(SEED_CONTAINER)).toBeVisible();
    });

    test('shows only loading while deleted containers are being listed', async ({ storage, page }) => {
        await page.route((url) => url.pathname.endsWith('/storage/fileStorage/deletedContainers'), async (route) => {
            await new Promise(r => setTimeout(r, 800));
            await route.fallback();
        });

        await storage.openDeletedContainers();

        await expect(storage.tid(TID.listLoading)).toBeVisible();
        await expect(page.getByText('No deleted containers', { exact: true })).toHaveCount(0);

        await expect(storage.tid(TID.listLoading)).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByText('No deleted containers', { exact: true })).toBeVisible();
    });

    test('shows only loading while recycle-bin items are being listed', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);
        await expect(storage.row('Folder 1')).toBeVisible({ timeout: 15_000 });
        await page.route((url) => url.pathname.endsWith('/recycleBin/items'), async (route) => {
            await new Promise(r => setTimeout(r, 800));
            await route.fallback();
        });

        await storage.openRecycleBin();

        await expect(storage.tid(TID.listLoading)).toBeVisible();
        await expect(page.getByText('Recycle bin is empty', { exact: true })).toHaveCount(0);

        await expect(storage.tid(TID.listLoading)).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByText('Recycle bin is empty', { exact: true })).toBeVisible();
    });
});
