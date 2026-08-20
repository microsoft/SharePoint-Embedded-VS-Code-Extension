/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What an empty listing is allowed to claim.
 *
 * Graph answers an under-permissioned enumeration with HTTP 200 and an empty `value` rather
 * than a 403, so "no items" is ambiguous by construction: it means either "there is nothing
 * here" or "you were never entitled to see it". Asserting the first reading without checking
 * the grant sends the user looking for missing data instead of a missing permission.
 *
 * These tests pin the resolution of that ambiguity — the plain empty state is reachable only
 * once the scopes behind the view are granted, and when it is reached it invites the user to
 * add content rather than leaving them at a dead end.
 */

import { test, expect } from '@playwright/test';
import { openStorageExplorer } from '../helpers/mock/harness';
import { seedState } from '../helpers/graphMock';

/** Everything the guided workflow needs, so nothing is gated unless a test removes it. */
const FULL_GRANT = [
    'read', 'write', 'create', 'delete', 'readContent', 'writeContent', 'managePermissions',
];

function grant(state: ReturnType<typeof seedState>, delegatedPermissions: string[]) {
    state.appPermissionGrants.set('spe-ui-test', {
        delegatedPermissions,
        applicationPermissions: [],
    });
}

test.describe('Empty listings are attributed to the grant behind them', () => {
    test('an empty container with no writeContent explains the scope instead of "this folder is empty"', async ({ page }) => {
        const state = seedState({ containers: 1, itemsPerContainer: 0 });
        // Enough to browse into the container, but nothing that could put a file in it.
        grant(state, ['read', 'create']);

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainer('Seed Container');

        await expect(page.getByTestId('empty-missing-permission')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('empty-missing-permission-scopes')).toContainText('writeContent');
        await expect(page.getByTestId('empty-missing-permission-grant')).toBeVisible();

        // The reading that sends the user hunting for missing files must be gone.
        await expect(page.getByTestId('filelist-empty')).toHaveCount(0);
        await expect(page.getByTestId('empty-folder-onboarding')).toHaveCount(0);
    });

    test('an empty container with a full grant invites the user to add content', async ({ page }) => {
        const state = seedState({ containers: 1, itemsPerContainer: 0 });
        grant(state, FULL_GRANT);

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainer('Seed Container');

        await expect(page.getByTestId('empty-folder-onboarding')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('filelist-empty')).toHaveText('This folder is empty');

        // Every offer here is reachable: the state is only rendered once its scopes are granted.
        await expect(page.getByTestId('empty-folder-upload')).toBeEnabled();
        await expect(page.getByTestId('empty-folder-new-folder')).toBeEnabled();
        await expect(page.getByTestId('empty-folder-new-word')).toBeEnabled();

        // The permission-blocked reading must not leak into a fully granted tenant.
        await expect(page.getByTestId('empty-missing-permission')).toHaveCount(0);
    });

    test('the upload offer opens a file picker rather than reporting a denial', async ({ page }) => {
        const state = seedState({ containers: 1, itemsPerContainer: 0 });
        grant(state, FULL_GRANT);

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainer('Seed Container');
        await expect(page.getByTestId('empty-folder-onboarding')).toBeVisible({ timeout: 30_000 });

        const chooser = page.waitForEvent('filechooser');
        await page.getByTestId('empty-folder-upload').click();
        expect(await chooser).toBeTruthy();

        await expect(page.getByTestId('permission-notice')).toHaveCount(0);
    });

    test('a "new document" offer opens its creation modal', async ({ page }) => {
        const state = seedState({ containers: 1, itemsPerContainer: 0 });
        grant(state, FULL_GRANT);

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainer('Seed Container');
        await expect(page.getByTestId('empty-folder-onboarding')).toBeVisible({ timeout: 30_000 });

        await page.getByTestId('empty-folder-new-folder').click();

        await expect(page.getByTestId('modal')).toBeVisible();
        await expect(page.getByTestId('permission-notice')).toHaveCount(0);
    });

    test('a filter that matches nothing is the user\'s doing, not a permission problem', async ({ page }) => {
        const state = seedState({ containers: 1 });
        // Deliberately partial: a filter miss must still be reported as a filter miss.
        grant(state, ['read']);

        const harness = await openStorageExplorer(page, state);
        await harness.view.search('nothing matches this');

        await expect(page.getByTestId('filelist-empty')).toHaveText('No items match your filter');
        await expect(page.getByTestId('empty-missing-permission')).toHaveCount(0);
    });
});
