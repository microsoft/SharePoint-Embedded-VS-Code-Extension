/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';

test.describe('Files & folders', () => {
    test('navigate into a container and see seeded items', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        // The seed adds a "Folder 1" and a couple of files.
        await expect(storage.row('Folder 1')).toBeVisible({ timeout: 30_000 });
    });

    test('create a new folder', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        const folder = `NewFolder-${Date.now()}`;
        await storage.newFolder(folder);
        await expect(storage.row(folder)).toBeVisible();
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
