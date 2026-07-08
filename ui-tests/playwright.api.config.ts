/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

/**
 * API-layer suite config: runs in Node (no browser, no dev server). Tests import the real
 * `*GraphService` classes and assert request shaping against a fake Graph client.
 */
export default defineConfig({
    testDir: path.join(__dirname, 'api'),
    testMatch: '**/*.api.spec.ts',
    timeout: 30_000,
    fullyParallel: true,
    workers: undefined,
    reporter: [['list']],
    outputDir: path.join(os.tmpdir(), 'spe-ui-tests', 'test-results-api'),
});
