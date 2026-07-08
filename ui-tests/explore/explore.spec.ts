/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from '@playwright/test';
import { installGraphMock } from '../helpers/graphMock';
import { makeFakeGraphJwt } from '../helpers/token';

/**
 * Interactive explore — opens a VISIBLE browser and holds it open so a human can scroll/interact.
 * Close the window when done (or it auto-ends after ~25 min).
 *
 *   npm run explore                              # 1000 containers at the root
 *   $env:SPE_EXPLORE_N=5000; npm run explore     # 5000 containers
 *   $env:SPE_EXPLORE_FOLDER=1; npm run explore   # open a container and STREAM 10,000 files in
 */
const FOLDER_MODE = process.env.SPE_EXPLORE_FOLDER === '1';
const N = Number(process.env.SPE_EXPLORE_N ?? (FOLDER_MODE ? 10000 : 1000));
const CT = 'ct-explore-00000000-0000-0000-0000-000000000000';

function driveItem(n: number) {
    const ext = n % 2 === 0 ? 'txt' : 'pdf';
    return {
        id: `f${n}`,
        name: `dummy_${String(n).padStart(5, '0')}.${ext}`,
        size: 1024,
        createdDateTime: new Date().toISOString(),
        lastModifiedDateTime: new Date().toISOString(),
        webUrl: 'https://contoso.sharepoint.com/x',
        file: { mimeType: ext === 'txt' ? 'text/plain' : 'application/pdf' },
    };
}

test(`explore ${FOLDER_MODE ? `${N} files streaming` : `${N} containers`} — scroll it, then close the window`, async ({ page }) => {
    test.setTimeout(30 * 60_000);

    await page.addInitScript(({ token, ct }) => {
        (window as unknown as Record<string, unknown>).__STORAGE_EXPLORER_STATE__ = {
            appName: 'Storage Explorer (explore)', tenantDomain: 'contoso.onmicrosoft.com', containerTypeId: ct, registrationId: 'reg',
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
    }, { token: makeFakeGraphJwt(), ct: CT });

    if (FOLDER_MODE) {
        // 1 container; the folder listing is served PAGINATED + delayed so the streaming
        // "Loading… N so far" indicator is visible ticking up.
        const state = await installGraphMock(page, { containers: 1 });
        state.containerTypeId = CT;
        state.containers[0].displayName = 'Big Folder (10k files)';

        const PAGE = 500;
        await page.route((url) => url.pathname.endsWith('/children'), async (route) => {
            const url = new URL(route.request().url());
            const start = Number(url.searchParams.get('$skiptoken') ?? '0');
            const count = Math.min(PAGE, N - start);
            const value = Array.from({ length: count }, (_, i) => driveItem(start + i));
            const nextStart = start + count;
            const body = nextStart < N
                ? { value, '@odata.nextLink': `https://graph.microsoft.com/v1.0/drives/x/root/children?$skiptoken=${nextStart}` }
                : { value };
            await new Promise(r => setTimeout(r, 300)); // ~6s to stream 10k in 500-item pages
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });

        await page.goto('/');
        const container = page.locator('[data-item-id]').first();
        await container.waitFor({ timeout: 60_000 });
        await container.dblclick();

        // eslint-disable-next-line no-console
        console.log(`\n========================================================================\n` +
            `[explore] Opening a container whose folder holds ${N} files.\n` +
            `[explore] WATCH the "Loading… N items so far" banner tick up as pages stream in,\n` +
            `[explore] then scroll the fully-loaded ${N}-item list.\n` +
            `[explore] CLOSE THE BROWSER WINDOW when you're done.\n` +
            `========================================================================\n`);
    } else {
        const state = await installGraphMock(page, { containers: N });
        state.containerTypeId = CT;
        await page.goto('/');
        await page.waitForFunction((expected) => {
            const rows = document.querySelectorAll('[data-item-id]').length;
            return rows > 0;
        }, N, { timeout: 3 * 60_000 });

        // eslint-disable-next-line no-console
        console.log(`\n========================================================================\n` +
            `[explore] ${N} containers loaded. Scroll the list; use the Filter box to search.\n` +
            `[explore] CLOSE THE BROWSER WINDOW when you're done.\n` +
            `========================================================================\n`);
    }

    await page.waitForEvent('close', { timeout: 25 * 60_000 }).catch(() => { /* ended by timeout */ });
});
