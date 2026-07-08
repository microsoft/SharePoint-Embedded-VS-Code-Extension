/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

test.describe('Containers', () => {
    test('create → assert row appears', async ({ storage }) => {
        const name = `ct-create-${Date.now()}`;
        await storage.createContainer(name, 'Created by SPE UI automation');
        await expect(storage.row(name)).toBeVisible();
    });

    test('rename a container', async ({ storage }) => {
        const name = `ct-rename-${Date.now()}`;
        const renamed = `${name}-renamed`;
        await storage.createContainer(name);
        await storage.renameContainer(name, renamed);
        await expect(storage.row(renamed)).toBeVisible();
        await expect(storage.row(name)).toHaveCount(0);
    });

    test('delete a container → moves to deleted containers → restore', async ({ storage }) => {
        const name = `ct-del-${Date.now()}`;
        await storage.createContainer(name);
        await storage.deleteContainer(name);

        await storage.openDeletedContainers();
        await expect(storage.recycledRow(name)).toBeVisible({ timeout: 30_000 });

        await storage.recycledRow(name).click();
        await storage.restoreSelected();
        await expect(storage.recycledRow(name)).toHaveCount(0, { timeout: 30_000 });
    });
});
