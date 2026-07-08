/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Page } from '@playwright/test';
import { GraphState, seedState } from './mock/state';
import { resolveRoute } from './mock/router';

export { GraphState } from './mock/state';
export { seedState } from './mock/state';

export interface GraphMockOptions {
    /** Provide a pre-built state. If omitted, a default seeded state is created. */
    state?: GraphState;
    /** When no `state` is given, seed this many containers (perf scenarios). Default 1. */
    containers?: number;
    /** When no `state` is given, seed this many drive items in each container. */
    itemsPerContainer?: number;
    /** Called for every intercepted Graph request (after it is handled) — useful for assertions. */
    onRequest?: (info: { method: string; pathname: string }) => void;
}

/**
 * Intercept all Microsoft Graph traffic and serve it from an in-memory {@link GraphState},
 * so the full Storage Explorer UI works deterministically without a tenant.
 *
 * Returns the live state so specs can pre-seed or assert against it.
 */
export async function installGraphMock(page: Page, opts: GraphMockOptions = {}): Promise<GraphState> {
    const state = opts.state ?? seedState({ containers: opts.containers, itemsPerContainer: opts.itemsPerContainer });

    await page.route(/https:\/\/graph\.microsoft\.com\/.*/, async (route) => {
        const req = route.request();
        const method = req.method();
        const url = new URL(req.url());

        let body: Record<string, unknown> = {};
        if (method === 'POST' || method === 'PATCH') {
            try { body = (req.postDataJSON() as Record<string, unknown>) ?? {}; } catch { body = {}; }
        }

        opts.onRequest?.({ method, pathname: url.pathname });

        const result = resolveRoute(method, url.pathname, url.searchParams, body, state);
        if (result) {
            await route.fulfill({
                status: result.status,
                contentType: 'application/json',
                body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body),
            });
            return;
        }

        // Unmatched: benign defaults so the UI never hangs waiting on Graph.
        if (method === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: [] }) });
        } else {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
        }
    });

    return state;
}
