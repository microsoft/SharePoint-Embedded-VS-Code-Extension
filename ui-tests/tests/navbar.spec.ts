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

    test('refresh works without error', async ({ storage }) => {
        await storage.tid(TID.navRefresh).click();
        // Container list still present after refresh.
        await expect(storage.tid(TID.actionNewContainer)).toBeVisible();
    });
});
