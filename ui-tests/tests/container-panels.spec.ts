/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';

/**
 * Exercises each container-scoped side panel: opens the tab via the context menu and asserts
 * the panel renders the seeded data (validates the read path through the mock + panel rendering).
 */
test.describe('Container side panels', () => {
    test('permissions panel lists the seeded permission', async ({ storage, page }) => {
        await storage.openContainerTab(SEED_CONTAINER, 'permissions');
        await expect(page.locator('[data-testid^="perm-row-"]').first()).toBeVisible({ timeout: 30_000 });
    });

    test('columns panel lists the seeded column', async ({ storage, page }) => {
        await storage.openContainerTab(SEED_CONTAINER, 'columns');
        await expect(page.locator('[data-testid^="column-row-"]').first()).toBeVisible({ timeout: 30_000 });
    });

    test('metadata panel lists the seeded custom property', async ({ storage }) => {
        await storage.openContainerTab(SEED_CONTAINER, 'metadata');
        await expect(storage.tid('metadata-row-Department')).toBeVisible({ timeout: 30_000 });
    });

    test('settings panel renders editable fields', async ({ storage, page }) => {
        await storage.openContainerTab(SEED_CONTAINER, 'settings');
        await expect(page.locator('[data-testid^="settings-field-"]').first()).toBeVisible({ timeout: 30_000 });
    });

    test('can switch between container tabs', async ({ storage }) => {
        await storage.openContainerTab(SEED_CONTAINER, 'permissions');
        await storage.switchTab('columns');
        await expect(storage.sidePanelTab('columns')).toBeVisible();
        await storage.switchTab('metadata');
        await expect(storage.tid('metadata-row-Department')).toBeVisible({ timeout: 30_000 });
    });
});
