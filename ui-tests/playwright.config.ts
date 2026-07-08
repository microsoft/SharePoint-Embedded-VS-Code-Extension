/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

/**
 * Playwright config for driving the **standalone Storage Explorer webview**.
 *
 * The webview is a Vite React app whose only VS Code coupling is a token-passing bridge.
 * We serve it with `npm run dev` (Vite) and drive it in a normal Chromium page — the tests
 * inject panel state + a token bridge shim (see fixtures.ts). No VS Code required.
 */
const PORT = Number(process.env.SPE_TEST_WEB_PORT ?? 5178);
const BASE_URL = `http://localhost:${PORT}`;

// Slow-motion: set SPE_TEST_SLOWMO (ms) to delay each action so the run is easy to watch.
// Any value > 0 also forces a headed (visible) browser.
const SLOW_MO = Number(process.env.SPE_TEST_SLOWMO ?? 0);

export default defineConfig({
    testDir: path.join(__dirname, 'tests'),
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [
        ['list'],
        ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
    ],
    // Keep Playwright artifacts OUT of the OneDrive-synced repo (sync locks EPERM the rmdir).
    outputDir: path.join(os.tmpdir(), 'spe-ui-tests', 'test-results'),
    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        // When slow-mo is on, show the browser and slow every action down.
        headless: SLOW_MO > 0 ? false : undefined,
        launchOptions: SLOW_MO > 0 ? { slowMo: SLOW_MO } : {},
    },
    // Auto-start the Vite dev server for the webview.
    webServer: {
        command: `npm run dev -- --port ${PORT} --strictPort`,
        cwd: path.join(__dirname, '..', 'webview-ui'),
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
