/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Explicit one-page-at-a-time loading in the webview (AC-02, AC-04, AC-06).
 */

import { test, expect } from '@playwright/test';
import { openStorageExplorer } from '../helpers/mock/harness';
import { seedState } from '../helpers/graphMock';
import { TID } from '../testids';

const PAGE_SIZE = 3;

/** A state with `count` containers, served `PAGE_SIZE` at a time. */
function pagedContainers(count: number) {
    const state = seedState({ containers: 0 });
    state.pageSize = PAGE_SIZE;
    for (let i = 0; i < count; i++) {
        // Descending-by-modified is the fixed default, so make creation order the expected order.
        state.addContainer(`Container ${String(i + 1).padStart(2, '0')}`, null, new Date(Date.UTC(2024, 0, count - i)).toISOString());
    }
    return state;
}

test.describe('AC-02 — Load more fetches exactly one page', () => {
    test('root container list pages on demand and stops offering more on the last page', async ({ page }) => {
        const state = pagedContainers(9);
        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        // Initial load: page one only.
        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        expect(harness.nextPageRequests()).toHaveLength(0);

        const loadMore = view.loadMoreButton();
        await expect(loadMore).toBeVisible();
        await expect(loadMore).toBeEnabled();

        const firstPage = await view.rowNames();

        // Click 1 → exactly one more request, appended below the untouched first page.
        await view.loadMore();
        expect(harness.nextPageRequests()).toHaveLength(1);
        const afterSecond = await view.rowNames();
        expect(afterSecond).toHaveLength(PAGE_SIZE * 2);
        expect(afterSecond.slice(0, PAGE_SIZE)).toEqual(firstPage);
        expect(new Set(afterSecond).size).toBe(afterSecond.length);

        // Click 2 → the final page; the affordance disappears.
        await view.loadMore();
        expect(harness.nextPageRequests()).toHaveLength(2);
        const afterThird = await view.rowNames();
        expect(afterThird).toHaveLength(9);
        expect(afterThird.slice(0, PAGE_SIZE * 2)).toEqual(afterSecond);
        expect(new Set(afterThird).size).toBe(afterThird.length);
        await expect(view.loadMoreButton()).toHaveCount(0);
    });

    test('nested folder contents page on demand', async ({ page }) => {
        const state = seedState({ containers: 0 });
        state.pageSize = PAGE_SIZE;
        const container = state.addContainer('Paged Container');
        const folder = state.addDriveItem(container.id, { name: 'Nested', isFolder: true });
        for (let i = 0; i < 9; i++) {
            state.addDriveItem(container.id, {
                name: `Child ${String(i + 1).padStart(2, '0')}.txt`,
                parentId: folder.id,
                lastModifiedDateTime: new Date(Date.UTC(2024, 0, 9 - i)).toISOString(),
            });
        }

        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await view.openContainer('Paged Container');
        await view.openFolder('Nested');

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        expect(harness.nextPageRequests()).toHaveLength(0);

        await view.loadMore();
        expect(harness.nextPageRequests()).toHaveLength(1);
        expect(await view.rowNames()).toHaveLength(PAGE_SIZE * 2);

        await view.loadMore();
        expect(harness.nextPageRequests()).toHaveLength(2);
        expect(await view.rowNames()).toHaveLength(9);
        await expect(view.loadMoreButton()).toHaveCount(0);
    });

    test('a failed Load more surfaces an error and the click can be retried', async ({ page }) => {
        const state = pagedContainers(9);
        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        const firstPage = await view.rowNames();

        // Fail only the next-page request, once. 500 (not 503) because the Graph SDK's retry
        // handler transparently retries 503/429/504, which would silently succeed on retry.
        let failed = false;
        await page.route(
            (url) => url.href.includes('graph.microsoft.com') && url.href.includes('skiptoken'),
            async (route) => {
                if (failed) { await route.fallback(); return; }
                failed = true;
                await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internalServerError', message: 'Try later' } }) });
            }
        );

        await view.loadMoreButton().click();

        // The failure is announced rather than swallowed, and the loading state is cleared.
        await expect(view.loadMoreError()).toBeVisible();
        await expect(view.loadMoreLoading()).toHaveCount(0);

        // Existing rows survive the failure and the affordance is still actionable.
        await expect.poll(() => view.rowNames()).toEqual(firstPage);
        await expect(view.loadMoreButton()).toBeVisible();
        await expect(view.loadMoreButton()).toBeEnabled();
        expect(harness.nextPageRequests(), 'the failed attempt is the only request so far').toHaveLength(1);

        // The retry redeems the reinstated continuation: exactly one more request, and it
        // fetches the page that failed rather than skipping past it.
        await view.loadMore();
        expect(harness.nextPageRequests(), 'a retry must issue exactly one further request').toHaveLength(2);
        const afterRetry = await view.rowNames();
        expect(afterRetry).toHaveLength(PAGE_SIZE * 2);
        expect(afterRetry.slice(0, PAGE_SIZE)).toEqual(firstPage);
        expect(new Set(afterRetry).size, 'the retried page must not duplicate rows').toBe(afterRetry.length);
        await expect(view.loadMoreError()).toHaveCount(0);
    });
});

test.describe('AC-04 — refresh invalidates continuation state', () => {
    test('refreshing returns to a single page and never appends stale rows', async ({ page }) => {
        const state = pagedContainers(9);
        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        await view.loadMore();
        expect(await view.rowNames()).toHaveLength(PAGE_SIZE * 2);

        await view.refreshContainers();

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        const names = await view.rowNames();
        expect(new Set(names).size).toBe(names.length);
    });

    test('navigating out of a folder discards its continuation', async ({ page }) => {
        const state = seedState({ containers: 0 });
        state.pageSize = PAGE_SIZE;
        const container = state.addContainer('Nav Container');
        const folder = state.addDriveItem(container.id, { name: 'Deep', isFolder: true });
        for (let i = 0; i < 6; i++) {
            state.addDriveItem(container.id, { name: `Deep ${i + 1}.txt`, parentId: folder.id });
        }

        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await view.openContainer('Nav Container');
        await view.openFolder('Deep');
        await view.loadMore();
        const inFolder = await view.rowNames();
        expect(inFolder).toHaveLength(PAGE_SIZE * 2);

        await view.breadcrumbTo(1);

        // Back at the drive root: only the root's own first page, none of the folder's rows.
        await expect.poll(async () => {
            const rows = await view.rowNames();
            return rows.some((name) => name.startsWith('Deep ') && name.endsWith('.txt'));
        }).toBe(false);
        await expect(view.row('Deep')).toBeVisible();
    });
});

test.describe('AC-06 — sorting and filtering act only on loaded rows', () => {
    test('sorting by name after one page reorders only loaded rows and fetches nothing', async ({ page }) => {
        const state = pagedContainers(9);
        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        const loaded = await view.rowNames();

        await view.sortBy(TID.sortName);

        expect(harness.nextPageRequests(), 'sorting must not fetch a hidden page').toHaveLength(0);
        const sorted = await view.rowNames();
        expect(sorted).toHaveLength(PAGE_SIZE);
        expect([...sorted].sort()).toEqual([...loaded].sort());
        expect(sorted).toEqual([...loaded].sort());

        // A newly loaded page joins the active local sort.
        await view.loadMore();
        const afterLoad = await view.rowNames();
        expect(afterLoad).toHaveLength(PAGE_SIZE * 2);
        expect(afterLoad).toEqual([...afterLoad].sort());
    });

    test('filtering searches only loaded rows and issues no request', async ({ page }) => {
        const state = pagedContainers(9);
        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
        const requestsBefore = harness.requests.length;

        // "Container 09" exists on the server but is not loaded, so it must not appear.
        await view.search('Container 09');
        await expect(view.row('Container 09')).toHaveCount(0);
        expect(harness.nextPageRequests()).toHaveLength(0);
        expect(harness.requests.length, 'filtering must not call Graph').toBe(requestsBefore);

        await view.clearSearch();
        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(PAGE_SIZE);
    });
});
