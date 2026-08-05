/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

test.describe('Select all + bulk delete', () => {
    test('select-all checks every row and bulk-deletes them', async ({ storage, page }) => {
        // Seed has 1 container; add two more → three total.
        await storage.createContainer(`sa-${Date.now()}-a`);
        await storage.createContainer(`sa-${Date.now()}-b`);

        // Select all via the header checkbox.
        await page.locator('[data-testid="select-all"]').click();
        await expect(page.locator('[data-testid="selection-count"]')).toHaveText('3 selected');
        await expect(page.locator('[data-testid="bulk-delete"]')).toContainText('Delete (3)');
        await expect(page.locator('[data-testid="file-row-checkbox"]:checked')).toHaveCount(3);

        // Bulk delete → confirm.
        await page.locator('[data-testid="bulk-delete"]').click();
        await page.locator('[data-testid="modal-confirm"]').click();

        // All three containers are gone from the list.
        await expect(page.locator('[data-item-id]')).toHaveCount(0, { timeout: 15_000 });
    });

    test('clear selection deselects everything', async ({ storage, page }) => {
        await page.locator('[data-testid="select-all"]').click();
        await expect(page.locator('[data-testid="selection-count"]')).toBeVisible();

        await page.locator('[data-testid="bulk-clear"]').click();
        await expect(page.locator('[data-testid="selection-count"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="file-row-checkbox"]:checked')).toHaveCount(0);
    });

    test('selecting one row shows an indeterminate select-all and a count of 1', async ({ storage, page }) => {
        // Add a second container so "one selected" is a partial selection.
        await storage.createContainer(`sa-${Date.now()}-c`);
        await page.locator('[data-testid="file-row-checkbox"]').first().check();
        await expect(page.locator('[data-testid="selection-count"]')).toHaveText('1 selected');
        // The header select-all is indeterminate (some, not all).
        const indeterminate = await page.locator('[data-testid="select-all"]').evaluate((el: HTMLInputElement) => el.indeterminate);
        expect(indeterminate).toBe(true);
    });

    test('cancelling a bulk delete stops the remaining items from being deleted', async ({ storage, page }) => {
        // Seed (1) + 4 more = 5 containers total.
        for (const n of ['x1', 'x2', 'x3', 'x4']) {
            await storage.createContainer(`cx-${Date.now()}-${n}`);
        }

        // Count and slow down each container DELETE, then fall through to the mock (which updates state).
        let deleteCount = 0;
        await page.route((u) => /\/storage\/fileStorage\/containers\/[^/]+$/.test(u.pathname), async (route) => {
            if (route.request().method() === 'DELETE') {
                deleteCount++;
                await new Promise(r => setTimeout(r, 500));
            }
            await route.fallback();
        });

        await page.locator('[data-testid="select-all"]').click();
        await page.locator('[data-testid="bulk-delete"]').click();
        await page.locator('[data-testid="modal-confirm"]').click();

        // Wait until the first delete has landed, then cancel the rest.
        await expect(page.locator('[data-testid="delete-progress"]')).toContainText(/Deleting 1 of 5/, { timeout: 15_000 });
        await page.locator('[data-testid="modal-cancel"]').click();

        // The modal closes once the loop breaks…
        await expect(page.locator('[data-testid="modal"]')).toHaveCount(0, { timeout: 15_000 });
        // …and NOT every container was deleted (the remaining ones never fired).
        expect(deleteCount).toBeLessThan(5);
        await expect(page.locator('[data-item-id]').first()).toBeVisible();
    });

    test('shows a "Deleting X of N" progress indicator during bulk delete', async ({ storage, page }) => {
        await storage.createContainer(`dp-${Date.now()}-a`);
        await storage.createContainer(`dp-${Date.now()}-b`);

        // Delay each container DELETE (then fall through to the mock) so progress is observable.
        await page.route((u) => /\/storage\/fileStorage\/containers\/[^/]+$/.test(u.pathname), async (route) => {
            if (route.request().method() === 'DELETE') {
                await new Promise(r => setTimeout(r, 400));
            }
            await route.fallback();
        });

        await page.locator('[data-testid="select-all"]').click();
        await page.locator('[data-testid="bulk-delete"]').click();
        await page.locator('[data-testid="modal-confirm"]').click();

        // The progress indicator ticks through "Deleting N of 3…".
        await expect(page.locator('[data-testid="delete-progress"]')).toContainText(/Deleting \d+ of 3/, { timeout: 15_000 });

        // Everything is gone once the deletes finish.
        await expect(page.locator('[data-item-id]')).toHaveCount(0, { timeout: 15_000 });
    });
});
