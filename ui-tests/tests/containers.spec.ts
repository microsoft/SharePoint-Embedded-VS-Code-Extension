/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import { TID } from '../testids';

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

    test('activate an inactive container from the action bar', async ({ storage }) => {
        const name = `ct-activate-${Date.now()}`;
        // Newly created containers come back inactive, and Graph's container list omits
        // `status` — the action bar must enrich the selection before gating "Activate".
        await storage.createContainer(name);
        await storage.select(name);
        await expect(storage.tid(TID.actionActivateContainer)).toBeVisible({ timeout: 30_000 });

        await storage.tid(TID.actionActivateContainer).click();
        await expect(storage.tid(TID.actionActivateContainer)).toHaveCount(0, { timeout: 30_000 });
    });

    test('activate an inactive container from a checkbox selection', async ({ storage }) => {
        const name = `ct-activate-cb-${Date.now()}`;
        await storage.createContainer(name);
        // Ticking the checkbox is a separate path from clicking the row: it populates
        // `selectedIds`, not `selectedItem`, and must enrich `status` on its own — otherwise
        // the bulk Activate button can never meet its `status === 'inactive'` condition.
        await storage.check(name);
        await expect(storage.tid(TID.selectionCount)).toHaveText('1 selected');

        await expect(storage.tid(TID.bulkActivateContainer)).toBeVisible({ timeout: 30_000 });
        await storage.tid(TID.bulkActivateContainer).click();

        // Activating clears the selection, so the whole bulk bar goes away.
        await expect(storage.tid(TID.bulkActivateContainer)).toHaveCount(0, { timeout: 30_000 });
        await expect(storage.tid(TID.selectionCount)).toHaveCount(0);

        // ...and it really is active now: re-selecting offers no Activate on either path.
        await storage.select(name);
        await expect(storage.tid(TID.actionDeleteContainer)).toBeEnabled();
        await expect(storage.tid(TID.actionActivateContainer)).toHaveCount(0);
    });

    test('no activate button when a checkbox selection spans more than one container', async ({ storage }) => {
        const a = `ct-multi-a-${Date.now()}`;
        const b = `ct-multi-b-${Date.now()}`;
        await storage.createContainer(a);
        await storage.createContainer(b);

        await storage.check(a);
        await expect(storage.tid(TID.bulkActivateContainer)).toBeVisible({ timeout: 30_000 });

        await storage.check(b);
        await expect(storage.tid(TID.selectionCount)).toHaveText('2 selected');
        await expect(storage.tid(TID.bulkActivateContainer)).toHaveCount(0);
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
