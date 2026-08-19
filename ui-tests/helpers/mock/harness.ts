/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Launcher for specs that need a *custom* Graph state (page sizes, ordering, grants) before the
 * app boots. The shared `storage` fixture always seeds a default state and navigates, which is
 * too late for those scenarios.
 */

import { Page } from '@playwright/test';
import { getStandaloneConfig } from '../../config';
import { installGraphMock } from '../graphMock';
import { StorageExplorerWebview } from '../../pages/StorageExplorerWebview';
import { GraphState } from './state';

export interface HarnessResult {
    view: StorageExplorerWebview;
    /** Every Graph request the page issued, in order. */
    requests: { method: string; pathname: string; url: string }[];
    /** Requests that carry a `$skiptoken`, i.e. explicit next-page fetches. */
    nextPageRequests(): { method: string; pathname: string; url: string }[];
    /** Count of GET requests whose pathname ends with `suffix`. */
    countGets(suffix: string): number;
}

/**
 * Boot the standalone Storage Explorer against `state` and wait for the first list to settle.
 *
 * `waitForReady: false` keeps the launcher usable for blocked/onboarding states, where the
 * container action bar is expected never to appear.
 */
export async function openStorageExplorer(
    page: Page,
    state: GraphState,
    opts: { waitForReady?: boolean } = {}
): Promise<HarnessResult> {
    const cfg = getStandaloneConfig();
    const requests: { method: string; pathname: string; url: string }[] = [];

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

    // Record the full URL (not just the pathname) so `$skiptoken` traffic is distinguishable.
    page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith('https://graph.microsoft.com/')) { return; }
        requests.push({ method: request.method(), pathname: new URL(url).pathname, url });
    });

    await installGraphMock(page, { state });
    await page.goto('/');

    const view = new StorageExplorerWebview(page);
    if (opts.waitForReady !== false) {
        await view.waitUntilReady();
    }

    return {
        view,
        requests,
        nextPageRequests: () => requests.filter((r) => r.url.includes('skiptoken')),
        countGets: (suffix: string) =>
            requests.filter((r) => r.method === 'GET' && r.pathname.endsWith(suffix)).length,
    };
}
