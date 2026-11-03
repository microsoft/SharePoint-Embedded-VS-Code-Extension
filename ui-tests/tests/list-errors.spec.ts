/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test as base, expect, Page } from '@playwright/test';
import { getStandaloneConfig } from '../config';
import { installGraphMock, seedState, GraphState } from '../helpers/graphMock';
import { StorageExplorerWebview } from '../pages/StorageExplorerWebview';
import { TID } from '../testids';

const CONTAINERS_LIST = /\/storage\/fileStorage\/containers(\?|$)/;

/**
 * Boot the app with a caller-supplied Graph state, without the shared fixture, so the very
 * first `containers.list()` can fail — the failure this suite is about happens on mount.
 */
async function boot(page: Page, state: GraphState): Promise<StorageExplorerWebview> {
    const cfg = getStandaloneConfig();
    await page.addInitScript(
        ({ panelState, token }) => {
            (window as unknown as Record<string, unknown>).__STORAGE_EXPLORER_STATE__ = panelState;
            (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__ = token;
        },
        {
            panelState: {
                appName: cfg.appName,
                tenantDomain: cfg.tenantDomain,
                containerTypeId: cfg.containerTypeId,
                registrationId: cfg.registrationId,
            },
            token: cfg.token,
        }
    );
    await installGraphMock(page, { state });
    return new StorageExplorerWebview(page);
}

/** Reject the container listing the way SPE does when the calling app has no grant. */
async function denyContainerList(page: Page, status = 403): Promise<void> {
    await page.route(
        url => CONTAINERS_LIST.test(url.pathname + url.search) && url.hostname === 'graph.microsoft.com',
        route => route.request().method() === 'GET'
            ? route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 'accessDenied', message: 'Access denied' } }),
            })
            : route.fallback()
    );
}

const test = base;

test.describe('Failed container listing', () => {
    test('keeps loading through a transient initial access denial and recovers automatically', async ({ page }) => {
        const storage = await boot(page, seedState());
        let attempts = 0;
        await page.route(url => CONTAINERS_LIST.test(url.pathname + url.search), async route => {
            if (route.request().method() !== 'GET') { await route.fallback(); return; }
            attempts++;
            if (attempts <= 2) {
                await route.fulfill({ status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } });
            } else {
                await route.fallback();
            }
        });
        await page.goto('/');
        await expect.poll(() => attempts).toBeGreaterThanOrEqual(1);
        await expect(storage.tid('list-loading')).toBeVisible();
        await expect(storage.tid('list-error')).toHaveCount(0);
        await expect(storage.tid('filelist-empty')).toHaveCount(0);
        await expect(storage.row('Seed Container')).toBeVisible();
        expect(attempts).toBe(3);
        await expect(storage.tid('list-error')).toHaveCount(0);
    });

    test('shows the existing Retry experience after 30 seconds of initial access denial', async ({ page }) => {
        await page.clock.install();
        const storage = await boot(page, seedState());
        let attempts = 0;
        await page.route(url => CONTAINERS_LIST.test(url.pathname + url.search), async route => {
            attempts++;
            await route.fulfill({ status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } });
        });
        await page.goto('/');
        await expect.poll(() => attempts).toBeGreaterThanOrEqual(1);
        await expect(storage.tid('list-loading')).toBeVisible();
        // Let the RPC deliver the denial before moving past its backoff timer.
        await page.waitForTimeout(100);
        await page.clock.fastForward(29_000);
        await expect(storage.tid('list-loading')).toBeVisible();
        await expect(storage.tid('list-error')).toHaveCount(0);
        await page.clock.fastForward(1100);
        await expect(storage.tid('list-error-retry')).toHaveText('Retry');
        await expect(storage.tid('list-error-message')).toContainText('Access denied');
        await expect(storage.tid('list-loading')).toHaveCount(0);

        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await installGraphMock(page, { state: seedState() });
        await storage.tid('list-error-retry').click();
        await expect(storage.row('Seed Container')).toBeVisible();
    });

    test('retries transient access denials on every refresh after a successful container load', async ({ page }) => {
        const storage = await boot(page, seedState());
        await page.goto('/');
        await expect(storage.row('Seed Container')).toBeVisible();

        let attempts = 0;
        let denialsRemaining = 0;
        await page.route(url => CONTAINERS_LIST.test(url.pathname + url.search), async route => {
            if (route.request().method() !== 'GET') { await route.fallback(); return; }
            attempts++;
            if (denialsRemaining > 0) {
                denialsRemaining--;
                await route.fulfill({ status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } });
            } else {
                await route.fallback();
            }
        });

        for (let refresh = 0; refresh < 2; refresh++) {
            denialsRemaining = 2;
            const previousAttempts = attempts;
            await storage.tid(TID.navRefresh).click();
            await expect.poll(() => attempts).toBeGreaterThan(previousAttempts);
            await expect(storage.tid('list-loading')).toBeVisible();
            await expect(storage.tid('list-error')).toHaveCount(0);
            await expect(storage.tid('filelist-empty')).toHaveCount(0);
            await expect.poll(() => attempts).toBe(previousAttempts + 3);
            await expect(storage.tid('list-loading')).toHaveCount(0);
            await expect(storage.row('Seed Container')).toBeVisible();
            await expect(storage.tid('list-error')).toHaveCount(0);
        }
    });

    test('gives refresh and manual Retry their own 30-second access-denial window', async ({ page }) => {
        await page.clock.install();
        const state = seedState();
        const storage = await boot(page, state);
        await page.goto('/');
        await expect(storage.row('Seed Container')).toBeVisible();

        let attempts = 0;
        await page.route(url => CONTAINERS_LIST.test(url.pathname + url.search), async route => {
            if (route.request().method() !== 'GET') { await route.fallback(); return; }
            attempts++;
            await route.fulfill({ status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } });
        });

        for (const trigger of [TID.navRefresh, 'list-error-retry']) {
            const previousAttempts = attempts;
            await storage.tid(trigger).click();
            await expect.poll(() => attempts).toBeGreaterThan(previousAttempts);
            await expect(storage.tid('list-loading')).toBeVisible();
            await page.waitForTimeout(100);
            await page.clock.fastForward(29_000);
            await expect(storage.tid('list-loading')).toBeVisible();
            await expect(storage.tid('list-error')).toHaveCount(0);
            await page.clock.fastForward(1100);
            await expect(storage.tid('list-error-message')).toContainText('Access denied');
            await expect(storage.tid('list-error-retry')).toHaveText('Retry');
            await expect(storage.tid('list-loading')).toHaveCount(0);
        }

        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await installGraphMock(page, { state });
        await storage.tid('list-error-retry').click();
        await expect(storage.row('Seed Container')).toBeVisible();
    });

    test('stops retrying a denied refresh when the user leaves the container list', async ({ page }) => {
        await page.clock.install();
        const storage = await boot(page, seedState());
        await page.goto('/');
        await expect(storage.row('Seed Container')).toBeVisible();

        let attempts = 0;
        await page.route(url => CONTAINERS_LIST.test(url.pathname + url.search), async route => {
            if (route.request().method() !== 'GET') { await route.fallback(); return; }
            attempts++;
            await route.fulfill({ status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } });
        });
        await storage.tid(TID.navRefresh).click();
        await expect.poll(() => attempts).toBe(1);
        await expect(storage.tid('list-loading')).toBeVisible();
        await storage.openDeletedContainers();
        await expect(storage.tid('list-loading')).toHaveCount(0);
        await page.clock.fastForward(31_000);
        expect(attempts).toBe(1);
        await expect(storage.tid('list-error')).toHaveCount(0);
    });

    test('refreshes action permissions when an external grant lands during the initial retry', async ({ page }) => {
        const state = seedState();
        const grants = new Map(state.appPermissionGrants);
        state.appPermissionGrants.clear();
        const storage = await boot(page, state);
        await page.goto('/');
        await expect(storage.tid('permission-banner')).toBeVisible();
        await expect(storage.tid('list-loading')).toBeVisible();
        for (const [id, grant] of grants) { state.appPermissionGrants.set(id, grant); }
        await expect(storage.row('Seed Container')).toBeVisible();
        await expect(storage.tid('permission-banner')).toHaveCount(0);
        await storage.tid('action-new-container').click();
        await expect(page.getByRole('dialog', { name: 'New container', exact: true })).toBeVisible();
    });

    test('shows a permissions state — not "this folder is empty" — when the extension app has no grant', async ({ page }) => {
        const state = seedState();
        // No grant for the extension app: exactly the tenant state that produces the 403.
        state.appPermissionGrants.clear();
        const storage = await boot(page, state);
        await denyContainerList(page);

        await page.goto('/');
        await storage.waitUntilReady();

        await expect(storage.tid('list-error')).toBeVisible({ timeout: 40_000 });
        await expect(storage.tid('list-error-title')).toHaveText('Permissions required');
        await expect(storage.tid('list-error-message')).toContainText('read permission on this container type');
        await expect(storage.tid('list-error-retry')).toHaveText('Grant permissions');

        // The misleading empty state must be gone.
        await expect(storage.tid('filelist-empty')).toHaveCount(0);
    });

    test('shows a generic failure state when the listing fails for a non-permission reason', async ({ page }) => {
        const state = seedState();
        const storage = await boot(page, state);
        await denyContainerList(page, 500);

        await page.goto('/');
        await storage.waitUntilReady();

        await expect(storage.tid('list-error')).toBeVisible({ timeout: 30_000 });
        await expect(storage.tid('list-error-title')).toHaveText('Something went wrong');
        await expect(storage.tid('list-error-retry')).toHaveText('Retry');
        await expect(storage.tid('filelist-empty')).toHaveCount(0);
    });

    test('still shows a non-error empty state when the listing succeeds with no containers', async ({ page }) => {
        const state = seedState();
        state.containers = [];
        const storage = await boot(page, state);

        await page.goto('/');
        await storage.waitUntilReady();

        // A permitted tenant with no containers yet gets the onboarding call to action,
        // never a failure state.
        await expect(storage.tid('first-container-onboarding')).toBeVisible();
        await expect(storage.tid('list-error')).toHaveCount(0);
        await expect(storage.tid('list-missing-permission')).toHaveCount(0);
    });

    test('the grant button raises the host grant flow and reloads once permissions land', async ({ page }) => {
        const state = seedState();
        state.appPermissionGrants.clear();
        const storage = await boot(page, state);
        await denyContainerList(page);

        await page.goto('/');
        await storage.waitUntilReady();
        await expect(storage.tid('list-error-retry')).toHaveText('Grant permissions', { timeout: 40_000 });

        // Access is restored once the grant exists, so drop the override first.
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await installGraphMock(page, { state });

        await storage.tid('list-error-retry').click();

        // The button asks the *host* to run the grant — it must not simply re-issue the
        // denied call and hope the host re-diagnoses it.
        await expect
            .poll(() => page.evaluate(() =>
                (window.__SPE_TEST_POSTED__ ?? []).filter(m => m.command === 'grantPermissions').length
            ))
            .toBe(1);
        // ...and the grant really was written, not just requested.
        await expect.poll(() => state.appPermissionGrants.size).toBe(1);

        // The result message drives the reload, so the failed view recovers on its own.
        await expect(storage.row('Seed Container')).toBeVisible({ timeout: 30_000 });
        await expect(storage.tid('list-error')).toHaveCount(0);
    });

    test('the generic failure button retries the listing rather than asking for a grant', async ({ page }) => {
        const state = seedState();
        const storage = await boot(page, state);
        await denyContainerList(page, 500);

        await page.goto('/');
        await storage.waitUntilReady();
        await expect(storage.tid('list-error-retry')).toHaveText('Retry');

        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await installGraphMock(page, { state });

        await storage.tid('list-error-retry').click();

        await expect(storage.row('Seed Container')).toBeVisible({ timeout: 30_000 });
        await expect(storage.tid('list-error')).toHaveCount(0);
        // A server error is not a permissions problem — nothing should have been granted.
        const asks = await page.evaluate(() =>
            (window.__SPE_TEST_POSTED__ ?? []).filter(m => m.command === 'grantPermissions').length
        );
        expect(asks).toBe(0);
    });

    test('a declined grant leaves the error in place and the button usable again', async ({ page }) => {
        const state = seedState();
        state.appPermissionGrants.clear();
        const storage = await boot(page, state);
        await denyContainerList(page);
        // Refuse the grant itself, standing in for the user declining the host prompt.
        await page.route(
            url => url.pathname.includes('/applicationPermissionGrants/'),
            route => route.request().method() === 'PUT'
                ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":"accessDenied"}}' })
                : route.fallback()
        );

        await page.goto('/');
        await storage.waitUntilReady();
        await expect(storage.tid('list-error-retry')).toHaveText('Grant permissions', { timeout: 40_000 });

        await storage.tid('list-error-retry').click();

        // The host always answers, so the button must not be left spinning.
        await expect(storage.tid('list-error-retry')).toHaveText('Grant permissions', { timeout: 30_000 });
        await expect(storage.tid('list-error-retry')).toBeEnabled();
        await expect(storage.tid('list-error')).toBeVisible();
    });

    test('a failed folder listing does not report the folder as empty', async ({ page }) => {
        const state = seedState();
        const storage = await boot(page, state);

        await page.goto('/');
        await storage.waitUntilReady();
        await storage.openContainer('Seed Container');
        await expect(storage.tid(TID.actionNewDropdown)).toBeVisible();

        // Fail the drive listing, then navigate back in to trigger a fresh load.
        await page.route(
            url => url.pathname.endsWith('/children'),
            route => route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 'accessDenied', message: 'Access denied' } }),
            })
        );
        await storage.breadcrumbTo(0);
        await storage.openContainer('Seed Container');

        await expect(storage.tid('list-error')).toBeVisible({ timeout: 30_000 });
        await expect(storage.tid('filelist-empty')).toHaveCount(0);
    });

    test('a folder error does not follow the user back to a healthy root', async ({ page }) => {
        const state = seedState();
        const storage = await boot(page, state);

        await page.goto('/');
        await storage.waitUntilReady();
        await page.route(
            url => url.pathname.endsWith('/children'),
            route => route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 'accessDenied', message: 'Access denied' } }),
            })
        );

        await storage.openContainer('Seed Container');
        await expect(storage.tid('list-error')).toBeVisible({ timeout: 30_000 });

        // Root is served from cache, so no load runs to clear the error — it must be
        // dropped on navigation, or a filter that matches nothing would surface it.
        await storage.breadcrumbTo(0);
        await expect(storage.row('Seed Container')).toBeVisible();
        await expect(storage.tid('list-error')).toHaveCount(0);

        await storage.search('nothing matches this');
        await expect(storage.tid('list-error')).toHaveCount(0);
        await expect(storage.tid('filelist-empty')).toHaveText('No items match your filter');
    });

    test('a slow failing listing does not poison the view the user navigated to', async ({ page }) => {
        const state = seedState();
        state.deletedContainers = [];
        const storage = await boot(page, state);

        // The folder listing fails, but only well after the user has moved on.
        await page.route(url => url.pathname.endsWith('/children'), async route => {
            await new Promise(r => setTimeout(r, 2500));
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 'accessDenied', message: 'Access denied' } }),
            });
        });

        await page.goto('/');
        await storage.waitUntilReady();
        await storage.openContainer('Seed Container');
        // Leave immediately, while the doomed request is still in flight.
        await storage.breadcrumbTo(0);
        await storage.openDeletedContainers();

        // Deleted containers legitimately loaded and is empty. The stale rejection must not
        // turn it into an error state.
        await expect(page.locator('[data-testid="list-error"]')).toHaveCount(0);
        await page.waitForTimeout(3500);
        await expect(page.locator('[data-testid="list-error"]')).toHaveCount(0);
    });
});
