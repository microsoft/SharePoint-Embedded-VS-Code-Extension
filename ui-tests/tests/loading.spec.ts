/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

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
    test('streams a multi-page folder in with a live "N so far" indicator', async ({ storage, page }) => {
        // Override the drive children endpoint with a SLOW, two-page response so the loading
        // indicator is observable. This route is registered after the fixture's mock, so it wins.
        await page.route((url) => url.pathname.endsWith('/children'), async (route) => {
            await new Promise(r => setTimeout(r, 1200));
            const url = route.request().url();
            const body = url.includes('skiptoken')
                ? { value: items(50, 50) }
                : { value: items(0, 50), '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/x/root/children?$skiptoken=PAGE2' };
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });

        await storage.openContainer(SEED_CONTAINER);

        // The loading banner appears and shows a running count once page 1 lands.
        await expect(storage.tid('list-loading')).toBeVisible();
        await expect(storage.tid('list-loading')).toContainText(/items so far/, { timeout: 15_000 });

        // When both pages have loaded, the banner disappears...
        await expect(storage.tid('list-loading')).toHaveCount(0, { timeout: 15_000 });

        // ...and a second-page item (File 99, only present after page 2) is findable via filter,
        // proving the whole folder streamed in.
        await storage.search('File 99.txt');
        await expect(storage.row('File 99.txt')).toBeVisible({ timeout: 15_000 });
    });
});
