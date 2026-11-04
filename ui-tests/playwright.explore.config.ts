/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

/**
 * Interactive "explore" config: opens a VISIBLE browser with N containers loaded (production
 * build) and holds it open so you can scroll/interact yourself. Not part of the automated runs.
 */
const PORT = Number(process.env.SPE_EXPLORE_PORT ?? 4181);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: path.join(__dirname, 'explore'),
    testMatch: '**/*.spec.ts',
    timeout: 30 * 60_000,
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    outputDir: path.join(os.tmpdir(), 'spe-ui-tests', 'explore-output'),
    use: {
        baseURL: BASE_URL,
        headless: false,
        viewport: { width: 1400, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
    },
    webServer: {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        cwd: path.join(__dirname, '..', 'webview-ui'),
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
