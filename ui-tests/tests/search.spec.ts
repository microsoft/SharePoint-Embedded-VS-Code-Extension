/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import { getStandaloneConfig } from '../config';
import { installGraphMock, seedState } from '../helpers/graphMock';

const SEED_CONTAINER = 'Seed Container';

test.describe('Search / filter', () => {
    test('filters the container list by name', async ({ storage, page }) => {
        // Create two distinctly-named containers on top of the seeded one.
        const alpha = `alpha-${Date.now()}`;
        const beta = `beta-${Date.now()}`;
        await storage.createContainer(alpha);
        await storage.createContainer(beta);

        await storage.search('alpha');
        await expect(storage.row(alpha)).toBeVisible();
        await expect(storage.row(beta)).toHaveCount(0);
        await expect(storage.row(SEED_CONTAINER)).toHaveCount(0);

        // Clearing the filter restores the full list.
        await storage.clearSearch();
        await expect(storage.row(beta)).toBeVisible();
        await expect(storage.row(SEED_CONTAINER)).toBeVisible();
    });

    test('shows a filter-specific empty state when nothing matches', async ({ storage }) => {
        await storage.search('zzz-no-such-container');
        await expect(storage.tid('filelist-empty')).toHaveText('No items match your filter');
    });

    test('filters files within a container', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);
        await expect(storage.row('Folder 1')).toBeVisible({ timeout: 30_000 });
        await storage.search('Folder 1');
        await expect(storage.row('Folder 1')).toBeVisible();
        // A seeded file should be filtered out.
        await expect(storage.row('File 2.docx')).toHaveCount(0);
    });

    test('filter resets when navigating into a container', async ({ storage }) => {
        await storage.search('Seed');
        await expect(storage.row(SEED_CONTAINER)).toBeVisible();
        await storage.openContainer(SEED_CONTAINER);
        // On navigation the filter clears, so seeded items show.
        await expect(storage.row('Folder 1')).toBeVisible({ timeout: 30_000 });
    });
});

test.describe('Search / filter at scale', () => {
    test('filters 1000 containers down to a handful', async ({ page }) => {
        const cfg = getStandaloneConfig();
        // Custom-seed 1000 containers, then add a uniquely findable one.
        const state = seedState({ containers: 1000 });
        const needle = state.addContainer('needle-unique-container');

        await page.addInitScript((token) => {
            (window as unknown as Record<string, unknown>).__STORAGE_EXPLORER_STATE__ = {
                appName: 'Search', tenantDomain: 'contoso.onmicrosoft.com', containerTypeId: 'ct', registrationId: 'reg',
            };
            (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__ = token;
            (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => ({
                postMessage: (msg: { command?: string; requestId?: string }) => {
                    if (msg && msg.command === 'getToken') {
                        window.dispatchEvent(new MessageEvent('message', {
                            data: { command: 'tokenResponse', token: (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__, requestId: msg.requestId },
                        }));
                    }
                },
            });
        }, cfg.token);
        state.containerTypeId = 'ct';
        await installGraphMock(page, { state });
        await page.goto('/');
        await page.waitForFunction(() => document.querySelectorAll('[data-item-id]').length > 0);

        await page.locator('[data-testid="search-input"]').fill('needle-unique');
        await expect(page.locator(`[data-testid="file-row-${needle.displayName}"]`)).toBeVisible();
        // The list collapses to just the match.
        await expect.poll(() => page.locator('[data-item-id]').count()).toBe(1);
    });
});
