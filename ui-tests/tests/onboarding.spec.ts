/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Guided onboarding: blocked states, denied interactions, and first-container creation
 * (AC-12, AC-16, AC-17).
 */

import { test, expect } from '@playwright/test';
import { openStorageExplorer } from '../helpers/mock/harness';
import { seedState } from '../helpers/graphMock';
import { TID } from '../testids';

/** Collection traffic that must never happen while the container type is not ready. */
function collectionRequests(requests: { method: string; pathname: string }[]) {
    return requests.filter((r) =>
        r.method === 'GET'
        && (/\/storage\/fileStorage\/containers$/.test(r.pathname)
            || /\/storage\/fileStorage\/deletedContainers$/.test(r.pathname)
            || r.pathname.endsWith('/children')
            || r.pathname.endsWith('/recycleBin/items'))
    );
}

test.describe('AC-12 — blocked container types show guidance, not Graph calls', () => {
    test('an ungranted extension app shows the update-permissions next action', async ({ page }) => {
        const state = seedState({ containers: 2 });
        state.appPermissionGrants.clear();

        const harness = await openStorageExplorer(page, state, { waitForReady: false });

        const guidance = page.getByText(/update .*permission/i).first();
        await expect(guidance).toBeVisible({ timeout: 30_000 });
        expect(collectionRequests(harness.requests), 'a blocked panel must not enumerate containers').toEqual([]);
    });

    test('an unregistered container type points at local-tenant registration', async ({ page }) => {
        const state = seedState({ containers: 0 });
        state.appPermissionGrants.clear();

        // No registration exists: the grant lookup 404s and container calls are denied.
        await page.route(
            (url) => url.href.includes('graph.microsoft.com') && url.href.includes('containerTypeRegistrations'),
            async (route) => {
                await route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: { code: 'itemNotFound', message: 'Registration not found' } }),
                });
            }
        );

        const harness = await openStorageExplorer(page, state, { waitForReady: false });

        await expect(page.getByText(/register|permission/i).first()).toBeVisible({ timeout: 30_000 });
        expect(collectionRequests(harness.requests)).toEqual([]);
    });
});

test.describe('AC-16 — denied interactions are actionable, not empty', () => {
    test('opening container permissions with a partial grant explains what is missing', async ({ page }) => {
        const state = seedState({ containers: 1 });
        // Everything except permission management.
        state.appPermissionGrants.set('spe-ui-test', {
            delegatedPermissions: ['read', 'write', 'create', 'delete', 'readContent', 'writeContent'],
            applicationPermissions: [],
        });

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainerTab('Seed Container', 'permissions');

        // A denial must be visible; an empty permission list would be a false success.
        const banner = page
            .locator(`[data-testid="${TID.permissionBanner}"]`)
            .or(page.getByText(/permission/i).filter({ hasText: /update|grant|required/i }))
            .first();
        await expect(banner).toBeVisible({ timeout: 15_000 });

        const action = page
            .locator(`[data-testid="${TID.permissionBannerAction}"]`)
            .or(page.getByRole('button', { name: /update .*permission|grant .*permission/i }))
            .first();
        await expect(action).toBeEnabled();

        await action.click();
        await expect
            .poll(async () => page.evaluate(() =>
                (window.__SPE_TEST_POSTED__ ?? []).some((m) => m.command === 'grantPermissions')))
            .toBe(true);
    });

    test('a denied container mutation reports the operation-specific scope', async ({ page }) => {
        const state = seedState({ containers: 1 });
        state.appPermissionGrants.set('spe-ui-test', {
            delegatedPermissions: ['read', 'readContent'],
            applicationPermissions: [],
        });

        const harness = await openStorageExplorer(page, state);
        await harness.view.tid(TID.actionNewContainer).click();
        await harness.view.tid(TID.newContainerNameInput).fill('Denied');
        await harness.view.tid(TID.modalConfirm).click();

        await expect(page.getByText(/permission/i).first()).toBeVisible({ timeout: 15_000 });
        await expect(harness.view.row('Denied'), 'a denied create must not produce a local row')
            .toHaveCount(0);
    });

    test('a denied file action reports the missing content scope and never calls Graph', async ({ page }) => {
        const state = seedState({ containers: 1 });
        // Enough to browse, but no `writeContent`: creating a folder must be denied in the host.
        state.appPermissionGrants.set('spe-ui-test', {
            delegatedPermissions: ['read', 'readContent'],
            applicationPermissions: [],
        });

        const harness = await openStorageExplorer(page, state);
        const view = harness.view;
        await view.openContainer('Seed Container');

        const before = harness.requests.filter((r) => r.method === 'POST' && r.pathname.endsWith('/children')).length;

        await view.tid(TID.actionNewDropdown).click();
        await view.tid(TID.actionNewFolder).click();
        await view.tid(TID.newItemNameInput).fill('Denied Folder');
        await view.tid(TID.modalConfirm).click();

        // Operation-specific guidance, and an offer to fix it — not a silent no-op.
        const banner = page
            .locator(`[data-testid="${TID.permissionBanner}"]`)
            .or(page.getByText(/permission/i).filter({ hasText: /update|grant|required|writeContent/i }))
            .first();
        await expect(banner).toBeVisible({ timeout: 15_000 });

        await expect(view.row('Denied Folder'), 'a denied create must not produce a local row')
            .toHaveCount(0);
        expect(
            harness.requests.filter((r) => r.method === 'POST' && r.pathname.endsWith('/children')).length,
            'a denied file action must not reach Graph'
        ).toBe(before);
    });
});

test.describe('AC-17 — first-container onboarding', () => {
    test('an empty ready list offers Create your first container and shows it immediately', async ({ page }) => {
        const state = seedState({ containers: 0 });
        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        const cta = page
            .locator(`[data-testid="${TID.onboardingCreateFirstContainer}"]`)
            .or(page.getByRole('button', { name: /create your first container/i }))
            .first();
        await expect(cta).toBeVisible({ timeout: 30_000 });

        await cta.click();
        await expect(view.tid(TID.modal)).toBeVisible();
        await view.tid(TID.newContainerNameInput).fill('My First Container');
        await view.confirmModal();

        // Visible immediately, at the top, without a refresh.
        await expect(view.row('My First Container')).toBeVisible({ timeout: 15_000 });
        expect((await view.rowNames())[0]).toBe('My First Container');
        await expect(cta).toHaveCount(0);

        // ...and usable straight away.
        await view.openContainer('My First Container');
        await expect(view.tid(TID.actionUpload)).toBeVisible();
    });
});
