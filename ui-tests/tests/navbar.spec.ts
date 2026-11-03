/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import { TID } from '../testids';

/** NavBar chrome: tenant identity, refresh, network drawer, side-panel toggle. */
test.describe('NavBar & chrome', () => {
    test('renders the tenant identity', async ({ storage }) => {
        await expect(storage.tid(TID.navTenantDomain)).toBeVisible();
    });

    test('network drawer toggles open', async ({ storage }) => {
        await storage.tid(TID.navNetworkToggle).click();
        await expect(storage.tid(TID.networkDrawer)).toBeVisible({ timeout: 15_000 });
    });

    test('HAR export reuses the acquired VS Code API, including repeated exports', async ({ storage, page }) => {
        await page.evaluate(() => {
            // VS Code permits one acquisition, already performed by the RPC bridge.
            Object.assign(window, {
                acquireVsCodeApi: () => { throw new Error('An instance of the VS Code API has already been acquired.'); },
            });
        });
        await storage.tid(TID.navNetworkToggle).click();
        const exportButton = storage.tid('network-export-har');
        await expect(exportButton).toBeEnabled();

        for (let count = 1; count <= 2; count++) {
            await exportButton.click();
            await expect.poll(() => page.evaluate(() =>
                window.__SPE_TEST_POSTED__?.filter(message => message.command === 'exportHar').length ?? 0
            )).toBe(count);
        }

        const har = await page.evaluate(() => {
            const message = window.__SPE_TEST_POSTED__?.find(entry => entry.command === 'exportHar');
            return typeof message?.har === 'string' ? message.har : '';
        });
        const { log } = JSON.parse(har);
        expect(log.version).toBe('1.2');
        expect(log.entries.length).toBeGreaterThan(0);
        for (const entry of log.entries) {
            for (const header of entry.request.headers) {
                if (header.name.toLowerCase() === 'authorization') {
                    expect(header.value).toBe('[redacted]');
                }
            }
        }
    });

    test('refresh works without error', async ({ storage }) => {
        await storage.tid(TID.navRefresh).click();
        // Container list still present after refresh.
        await expect(storage.tid(TID.actionNewContainer)).toBeVisible();
    });
});
