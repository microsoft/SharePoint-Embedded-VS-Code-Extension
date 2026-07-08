/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';
const SEED_FILE = 'File 2.docx';

/** File-scoped side panels: open each tab for a selected file and assert it renders. */
test.describe('File side panels', () => {
    test('properties panel renders for a file', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await storage.openItemTab(SEED_FILE, 'properties');
        await expect(storage.tid('properties-panel')).toBeVisible({ timeout: 30_000 });
    });

    test('versions tab is reachable for a file', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await storage.openItemTab(SEED_FILE, 'versions');
        await expect(storage.sidePanelTab('versions')).toBeVisible({ timeout: 30_000 });
    });

    test('permissions tab is reachable for a file', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await storage.openItemTab(SEED_FILE, 'permissions');
        await expect(storage.sidePanelTab('permissions')).toBeVisible({ timeout: 30_000 });
    });
});
