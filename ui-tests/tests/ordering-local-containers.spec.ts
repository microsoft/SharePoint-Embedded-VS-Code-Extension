/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Fixed default ordering and the session-local container overlay (AC-05, AC-07, AC-08).
 */

import { test, expect } from '@playwright/test';
import { openStorageExplorer } from '../helpers/mock/harness';
import { seedState } from '../helpers/graphMock';
import { TID } from '../testids';

/** Containers whose creation timestamps are deliberately out of insertion order. */
function outOfOrderContainers() {
    const state = seedState({ containers: 0 });
    state.addContainer('Middle', null, '2024-05-01T00:00:00Z');
    state.addContainer('Oldest', null, '2023-01-01T00:00:00Z');
    state.addContainer('Newest', null, '2025-09-01T00:00:00Z');
    return state;
}

test.describe('AC-05 — Date Modified is a fixed descending default', () => {
    test('containers render newest first regardless of server order', async ({ page }) => {
        const harness = await openStorageExplorer(page, outOfOrderContainers());

        await expect.poll(() => harness.view.rowNames()).toEqual(['Newest', 'Middle', 'Oldest']);
    });

    test('files render newest first regardless of server order', async ({ page }) => {
        const state = seedState({ containers: 0 });
        const container = state.addContainer('Files');
        state.addDriveItem(container.id, { name: 'b-middle.txt', lastModifiedDateTime: '2024-05-01T00:00:00Z' });
        state.addDriveItem(container.id, { name: 'c-oldest.txt', lastModifiedDateTime: '2023-01-01T00:00:00Z' });
        state.addDriveItem(container.id, { name: 'a-newest.txt', lastModifiedDateTime: '2025-09-01T00:00:00Z' });

        const harness = await openStorageExplorer(page, state);
        await harness.view.openContainer('Files');

        await expect.poll(() => harness.view.rowNames()).toEqual(['a-newest.txt', 'b-middle.txt', 'c-oldest.txt']);
    });

    test('clicking Date Modified does not toggle the direction', async ({ page }) => {
        const harness = await openStorageExplorer(page, outOfOrderContainers());
        const expected = ['Newest', 'Middle', 'Oldest'];

        await expect.poll(() => harness.view.rowNames()).toEqual(expected);

        await harness.view.sortBy(TID.sortModified);
        await expect.poll(() => harness.view.rowNames()).toEqual(expected);

        await harness.view.sortBy(TID.sortModified);
        await expect.poll(() => harness.view.rowNames()).toEqual(expected);
    });

    test('keyboard-activating Date Modified does not toggle the direction', async ({ page }) => {
        const harness = await openStorageExplorer(page, outOfOrderContainers());
        const expected = ['Newest', 'Middle', 'Oldest'];

        await expect.poll(() => harness.view.rowNames()).toEqual(expected);

        const header = harness.view.tid(TID.sortModified);
        await header.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');

        await expect.poll(() => harness.view.rowNames()).toEqual(expected);
    });
});

test.describe('AC-07 — locally created containers stay pinned at the top', () => {
    test('new containers stay above authoritative rows under any sort column', async ({ page }) => {
        const state = seedState({ containers: 0 });
        state.addContainer('AAA Server One', null, '2025-01-01T00:00:00Z');
        state.addContainer('ZZZ Server Two', null, '2024-01-01T00:00:00Z');

        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(2);

        // Freeze enumeration so the created containers can only come from the local overlay.
        await page.route(
            (url) => url.href.includes('graph.microsoft.com') && /\/storage\/fileStorage\/containers(\?|$)/.test(url.href),
            async (route) => {
                if (route.request().method() !== 'GET') { await route.fallback(); return; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        value: [
                            { id: 'srv-1', displayName: 'AAA Server One', containerTypeId: state.containerTypeId, createdDateTime: '2025-01-01T00:00:00Z' },
                            { id: 'srv-2', displayName: 'ZZZ Server Two', containerTypeId: state.containerTypeId, createdDateTime: '2024-01-01T00:00:00Z' },
                        ],
                    }),
                });
            }
        );

        await view.createContainer('Local First');
        await view.dismissModalIfOpen();
        await view.createContainer('Local Second');
        await view.dismissModalIfOpen();

        const pinned = ['Local Second', 'Local First'];
        await expect.poll(() => view.rowNames().then((r) => r.slice(0, 2))).toEqual(pinned);

        for (const column of [TID.sortName, TID.sortType, TID.sortSize]) {
            await view.sortBy(column);
            await expect
                .poll(() => view.rowNames().then((r) => r.slice(0, 2)), { timeout: 10_000 })
                .toEqual(pinned);
        }
    });
});

test.describe('AC-08 — the authoritative page reconciles the local overlay', () => {
    test('a later page containing the local id yields exactly one row with server data', async ({ page }) => {
        const state = seedState({ containers: 0 });
        state.pageSize = 2;
        state.addContainer('Server A', null, '2024-03-01T00:00:00Z');
        state.addContainer('Server B', null, '2024-02-01T00:00:00Z');
        state.addContainer('Server C', null, '2024-01-01T00:00:00Z');

        const harness = await openStorageExplorer(page, state);
        const view = harness.view;

        await expect.poll(() => view.rowNames().then((r) => r.length)).toBe(2);

        await view.createContainer('Reconciled');
        await view.dismissModalIfOpen();
        await expect(view.row('Reconciled')).toBeVisible();

        // The new container is now part of the authoritative collection, so a later page
        // returns it. It must reconcile rather than duplicate.
        await view.loadMore();

        await expect(view.row('Reconciled')).toHaveCount(1);
        const names = await view.rowNames();
        expect(new Set(names).size, 'no duplicate rows after reconciliation').toBe(names.length);
        expect(names).toContain('Reconciled');

        // The reconciled row is still fully interactive.
        await view.select('Reconciled');
        await expect(view.row('Reconciled')).toBeVisible();
    });
});
