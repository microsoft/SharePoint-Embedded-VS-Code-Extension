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

        // Inject panel state + a token bridge shim BEFORE the app's scripts run. This makes the
        // webview believe it's inside VS Code and supplies the bearer token for Graph calls.
        await page.addInitScript(
            ({ state, token }) => {
                (window as unknown as Record<string, unknown>).__STORAGE_EXPLORER_STATE__ = state;
                (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__ = token;
                (window as unknown as Record<string, unknown>).acquireVsCodeApi = function () {
                    return {
                        postMessage: function (msg: { command?: string; requestId?: string }) {
                            if (msg && msg.command === 'getToken') {
                                window.dispatchEvent(
                                    new MessageEvent('message', {
                                        data: {
                                            command: 'tokenResponse',
                                            token: (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__,
                                            requestId: msg.requestId,
                                        },
                                    })
                                );
                            }
                        },
                    };
                };
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
