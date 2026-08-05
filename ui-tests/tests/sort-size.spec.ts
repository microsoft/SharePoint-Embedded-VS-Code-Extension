/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';

// Files whose byte sizes deliberately cross unit boundaries (KB vs MB vs GB).
// The bug: sorting the formatted display string ("500 KB", "2 MB") compared the
// leading number and ignored the unit, so 500 KB sorted ABOVE 2 MB.
const FILES = [
    { id: 'sz-tiny', name: 'tiny.bin', size: 100 * 1024 },              // 100 KB
    { id: 'sz-small', name: 'small.bin', size: 500 * 1024 },            // 500 KB
    { id: 'sz-mid', name: 'mid.bin', size: 2 * 1024 * 1024 },           // 2 MB
    { id: 'sz-big', name: 'big.bin', size: 3 * 1024 * 1024 * 1024 },    // 3 GB
];

test.describe('Sort by size', () => {
    test('sorts by real byte magnitude, not the formatted string (KB stays below MB)', async ({ storage, page }) => {
        // Serve a scrambled, cross-unit listing for this container's children.
        const scrambled = [FILES[2], FILES[3], FILES[0], FILES[1]];
        await page.route(
            (u) => u.pathname.endsWith('/children'),
            async (route) => {
                if (route.request().method() !== 'GET') { return route.fallback(); }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        value: scrambled.map(f => ({
                            id: f.id,
                            name: f.name,
                            size: f.size,
                            file: { mimeType: 'application/octet-stream' },
                            createdDateTime: new Date().toISOString(),
                            lastModifiedDateTime: new Date().toISOString(),
                            webUrl: `https://contoso.sharepoint.com/${f.name}`,
                        })),
                    }),
                });
            }
        );

        const rowOrder = async (): Promise<string[]> => {
            const ids = await page.locator('[data-item-id]').evaluateAll(
                (els: Element[]) => els.map(e => e.getAttribute('data-testid') ?? '')
            );
            return ids.map(t => t.replace(/^file-row-/, ''));
        };

        await storage.openContainer(SEED_CONTAINER);
        await expect(storage.row('big.bin')).toBeVisible({ timeout: 30_000 });

        // Ascending by size: 100 KB < 500 KB < 2 MB < 3 GB.
        await page.locator('[data-testid="sort-size"]').click();
        await expect.poll(rowOrder).toEqual(['tiny.bin', 'small.bin', 'mid.bin', 'big.bin']);

        // Descending flips it.
        await page.locator('[data-testid="sort-size"]').click();
        await expect.poll(rowOrder).toEqual(['big.bin', 'mid.bin', 'small.bin', 'tiny.bin']);
    });
});
