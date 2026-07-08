/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';

test.describe('Recycle bin', () => {
    test('deleted item lands in the container recycle bin and can be restored', async ({ storage }) => {
        // Create + delete an item inside the container.
        await storage.openContainer(SEED_CONTAINER);
        const folder = `Recy-${Date.now()}`;
        await storage.newFolder(folder);
        await storage.deleteItem(folder);

        // Back to root, open the container's recycle bin via its context menu.
        await storage.breadcrumbTo(0);
        await storage.openRowMenu(SEED_CONTAINER);
        await storage.clickMenuItem('recycle-bin');

        // The deleted item is listed; select and restore it.
        await expect(storage.recycledRow(folder)).toBeVisible({ timeout: 30_000 });
        await storage.recycledRow(folder).click();
        await storage.restoreSelected();
        await expect(storage.recycledRow(folder)).toHaveCount(0, { timeout: 30_000 });
    });

    test('deleted item can be permanently deleted from the recycle bin', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        const folder = `Perm-${Date.now()}`;
        await storage.newFolder(folder);
        await storage.deleteItem(folder);

        await storage.breadcrumbTo(0);
        await storage.openRowMenu(SEED_CONTAINER);
        await storage.clickMenuItem('recycle-bin');

        await expect(storage.recycledRow(folder)).toBeVisible({ timeout: 30_000 });
        await storage.recycledRow(folder).click();
        await storage.permanentlyDeleteSelected();
        // A confirm modal may appear for permanent delete.
        const confirm = storage.tid('modal-confirm');
        if (await confirm.isVisible().catch(() => false)) {
            await confirm.click();
        }
        await expect(storage.recycledRow(folder)).toHaveCount(0, { timeout: 30_000 });
    });
});
