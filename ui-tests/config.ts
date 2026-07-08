/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { makeFakeGraphJwt } from './helpers/token';

/**
 * Minimal .env loader (no external dependency). Real environment values take precedence, so
 * CI secret stores override a local .env file.
 */
let _dotEnvLoaded = false;
function loadDotEnvOnce(): void {
    if (_dotEnvLoaded) { return; }
    _dotEnvLoaded = true;

    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) { return; }

    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) { continue; }
        const eq = line.indexOf('=');
        if (eq < 0) { continue; }
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) { process.env[key] = value; }
    }
}

export interface StandaloneConfig {
    /** true = Microsoft Graph is mocked (default, no tenant). false = hit the real Graph API. */
    mock: boolean;
    /** Bearer token the webview will use (fake JWT in mock mode; real token in live mode). */
    token: string;
    /** Container type the Storage Explorer targets. */
    containerTypeId: string;
    registrationId: string;
    tenantDomain: string;
    appName: string;
}

/**
 * Resolve the run configuration.
 *
 * - LIVE mode: set SPE_TEST_ACCESS_TOKEN (a real Graph delegated token with
 *   FileStorageContainer.Selected for your testing tenant) and SPE_TEST_CONTAINER_TYPE_ID.
 * - MOCK mode (default): no env needed — Graph is mocked and the full UI flow runs
 *   deterministically.
 */
export function getStandaloneConfig(): StandaloneConfig {
    loadDotEnvOnce();

    const realToken = process.env.SPE_TEST_ACCESS_TOKEN?.trim();
    if (realToken) {
        const containerTypeId = process.env.SPE_TEST_CONTAINER_TYPE_ID?.trim();
        if (!containerTypeId) {
            throw new Error(
                '[ui-tests] LIVE mode: set SPE_TEST_CONTAINER_TYPE_ID when SPE_TEST_ACCESS_TOKEN is provided.'
            );
        }
        return {
            mock: false,
            token: realToken,
            containerTypeId,
            registrationId: process.env.SPE_TEST_REGISTRATION_ID ?? '',
            tenantDomain: process.env.SPE_TEST_TENANT_DOMAIN ?? 'tenant.onmicrosoft.com',
            appName: 'SPE UI Test',
        };
    }

    return {
        mock: true,
        token: makeFakeGraphJwt(),
        containerTypeId: 'ct-mock-00000000-0000-0000-0000-000000000000',
        registrationId: 'reg-mock',
        tenantDomain: 'contoso.onmicrosoft.com',
        appName: 'SPE UI Test (mock)',
    };
}
