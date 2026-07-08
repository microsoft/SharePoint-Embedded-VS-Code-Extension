/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

/**
 * Performance benchmark config.
 *
 * Serves a PRODUCTION build of the webview (`vite build` + `vite preview`) — NOT the dev server —
 * so React runs in production mode (no StrictMode double-render, minified) and the numbers are
 * representative. Single worker, serial, generous timeouts (large N can be slow — that's the point).
 */
const PORT = Number(process.env.SPE_PERF_PORT ?? 4180);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: path.join(__dirname, 'perf'),
    testMatch: '**/*.perf.spec.ts',
    timeout: 10 * 60_000,
    expect: { timeout: 5 * 60_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    outputDir: path.join(os.tmpdir(), 'spe-ui-tests', 'perf-output'),
    use: {
        baseURL: BASE_URL,
        viewport: { width: 1280, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
    },
    webServer: {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        cwd: path.join(__dirname, '..', 'webview-ui'),
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
