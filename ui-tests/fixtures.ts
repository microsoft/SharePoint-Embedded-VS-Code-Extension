/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test as base, expect } from '@playwright/test';
import { getStandaloneConfig } from './config';
import { installGraphMock } from './helpers/graphMock';
import { StorageExplorerWebview } from './pages/StorageExplorerWebview';

type SpeFixtures = {
    /** The Storage Explorer webview, navigated and ready. */
    storage: StorageExplorerWebview;
};

export const test = base.extend<SpeFixtures>({
    storage: async ({ page }, use) => {
        const cfg = getStandaloneConfig();

        // Inject panel state + test token BEFORE the app's scripts run. In Vite dev,
        // webview-ui/src/testHost.ts installs the VS Code RPC emulator that uses this token.
        await page.addInitScript(
            ({ state, token }) => {
                (window as unknown as Record<string, unknown>).__STORAGE_EXPLORER_STATE__ = state;
                (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__ = token;
            },
            {
                state: {
                    appName: cfg.appName,
                    tenantDomain: cfg.tenantDomain,
                    containerTypeId: cfg.containerTypeId,
                    registrationId: cfg.registrationId,
                },
                token: cfg.token,
            }
        );

        if (cfg.mock) {
            await installGraphMock(page);
        }

        await page.goto('/');

        const view = new StorageExplorerWebview(page);
        await view.waitUntilReady();
        await use(view);
    },
});

export { expect };
