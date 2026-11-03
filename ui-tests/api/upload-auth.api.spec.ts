/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import type { VSCodeAuthConfig } from '../../src/services/Auth/VSCodeAuthProvider';
import { mockModuleFor } from '../helpers/mock/moduleStub';
import { installVscodeStub } from '../helpers/mock/vscodeStub';

installVscodeStub();
const parent = 'services/StorageExplorer/uploadAuth.ts';
const origin = 'https://contoso.sharepoint.com';
const calls: { interactive: boolean; account: { id: string; label: string } | undefined }[] = [];
const configs: VSCodeAuthConfig[] = [];
let failure: unknown;
let silentFailure = false;

mockModuleFor(parent, './graphClient', { createGraphClient: () => ({}) });
mockModuleFor(parent, './temporaryGraphUpload', {
    createTemporaryGraphUpload: () => { throw new Error('Not used by authentication tests'); },
});
mockModuleFor(parent, 'vscode', {
    l10n: {
        t: (message: string, ...args: string[]) =>
            message.replace(/\{(\d+)\}/g, (_match, index: string) => args[Number(index)]),
    },
});
mockModuleFor(parent, '../../client', { clientId: 'test-client' });
mockModuleFor(parent, '../AuthenticationState', {
    AuthenticationState: {
        getCurrentAccountSync: () => ({ id: 'account', username: 'test@example.test', tenantId: 'tenant' }),
    },
});
mockModuleFor(parent, '../Auth', {
    VSCodeAuthProvider: class {
        constructor(config: VSCodeAuthConfig) { configs.push(config); }
        async getToken(_scopes?: string[], interactive = false, account?: { id: string; label: string }): Promise<string> {
            calls.push({ interactive, account });
            if (failure !== undefined) { throw failure; }
            if (silentFailure && !interactive) { throw new Error('No authentication session available'); }
            return 'test-only-token';
        }
    },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createUploadSessionOptions }: typeof import('../../src/services/StorageExplorer/uploadAuth') =
    require('../../src/services/StorageExplorer/uploadAuth');

test.beforeEach(() => {
    calls.length = 0;
    configs.length = 0;
    failure = undefined;
    silentFailure = false;
});

test('SharePoint token acquisition pins the tenant and account and falls back to interactive sign-in', async () => {
    silentFailure = true;
    const options = createUploadSessionOptions(undefined);
    await expect(options.acquireToken!(origin)).resolves.toBe('test-only-token');
    expect(configs).toEqual([{ clientId: 'test-client', tenantId: 'tenant', scopes: [`${origin}/.default`] }]);
    expect(calls).toEqual([
        { interactive: false, account: { id: 'account', label: 'test@example.test' } },
        { interactive: true, account: { id: 'account', label: 'test@example.test' } },
    ]);
});

test('authentication errors preserve only the Entra identifier, not credentials or sign-in URLs', async () => {
    failure = new Error('AADSTS65001: token=TEST-SECRET https://login.example.test/?code=TEST-CODE user@example.test');
    const options = createUploadSessionOptions(undefined);
    const error = await options.acquireToken!(origin).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('AADSTS65001');
    expect(message).not.toContain('TEST-SECRET');
    expect(message).not.toContain('TEST-CODE');
    expect(message).not.toContain('user@example.test');
    expect(message).not.toContain('https://');
});

test('structured provider codes are preserved without arbitrary provider details', async () => {
    failure = { code: 'invalid_resource', message: 'TEST-SECRET' };
    const options = createUploadSessionOptions(undefined);
    await expect(options.acquireToken!(origin)).rejects.toThrow('(invalid_resource)');
});

test('native broker failures identify the browser sign-in workaround without exposing provider details', async () => {
    for (const error of [
        new Error('platform_broker_error: https://example.test/?token=TEST-SECRET'),
        { errorCode: 'platform_broker_error', message: 'TEST-SECRET' },
    ]) {
        failure = error;
        const options = createUploadSessionOptions(undefined);
        const result = await options.acquireToken!(origin).catch((value: unknown) => value);
        expect(result).toBeInstanceOf(Error);
        const message = result instanceof Error ? result.message : '';
        expect(message).toContain('platform_broker_error');
        expect(message).toContain('"microsoft-authentication.implementation" to "msal-no-broker"');
        expect(message).toContain('If your organization permits');
        expect(message).toContain('not just uploads');
        expect(message).not.toContain('TEST-SECRET');
        expect(message).not.toContain('https://');
        expect(message).not.toContain('consent');
    }
});

test('declined consent and missing error codes are distinguished from confirmed missing consent', async () => {
    const options = createUploadSessionOptions(undefined);
    failure = new Error('User did not consent.');
    await expect(options.acquireToken!(origin)).rejects.toThrow('cancelled or declined');
    failure = new Error('TEST-SECRET https://example.test/?token=TEST-SECRET');
    await expect(options.acquireToken!(origin)).rejects.toThrow('supplied no recognized error code');
});
