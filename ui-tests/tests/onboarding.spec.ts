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

    test('a missing create grant disables New Container and names the required scope', async ({ page }) => {
        const state = seedState({ containers: 1 });
        state.appPermissionGrants.set('spe-ui-test', {
            delegatedPermissions: ['read', 'readContent'],
            applicationPermissions: [],
        });

        const harness = await openStorageExplorer(page, state);
        const create = harness.view.tid(TID.actionNewContainer);

        await expect(create).toHaveAttribute('aria-disabled', 'true');
        await expect(create).toHaveAttribute('title', /create app permission/i);
        await create.click();
        await expect(page.getByTestId('permission-notice')).toContainText('create app permission');
        await expect(harness.view.tid(TID.modal)).toHaveCount(1);
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

        const newItem = view.tid(TID.actionNewDropdown);
        const upload = view.tid(TID.actionUpload);
        await expect(newItem).toHaveAttribute('aria-disabled', 'true');
        await expect(newItem).toHaveAttribute('title', /writeContent app permission/i);
        await expect(upload).toHaveAttribute('aria-disabled', 'true');
        await expect(upload).toHaveAttribute('title', /writeContent app permission/i);
        await newItem.click();

        await expect(page.getByTestId('permission-notice')).toContainText('writeContent app permission');

        await expect(view.row('Denied Folder'), 'a denied create must not produce a local row')
            .toHaveCount(0);
        expect(
            harness.requests.filter((r) => r.method === 'POST' && r.pathname.endsWith('/children')).length,
            'a denied file action must not reach Graph'
        ).toBe(before);
    });

    test('missing readContent disables preview and download while read-only browsing remains available', async ({ page }) => {
        const state = seedState({ containers: 1 });
        state.appPermissionGrants.set('spe-ui-test', {
            delegatedPermissions: ['read'],
            applicationPermissions: [],
        });

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainer('Seed Container');
        await harness.view.row('Report.docx').click();

        await expect(harness.view.tid(TID.actionPreview)).toHaveAttribute('aria-disabled', 'true');
        await expect(harness.view.tid(TID.actionPreview)).toHaveAttribute('title', /readContent app permission/i);
        await expect(harness.view.tid(TID.actionDownload)).toHaveAttribute('aria-disabled', 'true');
        await expect(harness.view.tid(TID.actionDownload)).toHaveAttribute('title', /readContent app permission/i);
        await expect(harness.view.row('Report.docx')).toBeVisible();
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
