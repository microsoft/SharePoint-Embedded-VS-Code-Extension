/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Blob } from 'buffer';
import type { AuthenticationGetSessionOptions } from 'vscode';
import { createTemporaryGraphUpload } from '../../src/services/StorageExplorer/temporaryGraphUpload';
import type { NetworkRequest } from '../../src/services/StorageExplorer/protocol';
import { mockModuleFor } from '../helpers/mock/moduleStub';
import { installVscodeStub } from '../helpers/mock/vscodeStub';

installVscodeStub();
const requests: AuthenticationGetSessionOptions[] = [];
let available = true;
let currentAccountId = 'account';
let onGetSession = (): void => {};
mockModuleFor('services/Auth/VSCodeAuthProvider.ts', 'vscode', {
    authentication: {
        getSession: async (_provider: string, _scopes: string[], options: AuthenticationGetSessionOptions) => {
            requests.push(options);
            onGetSession();
            return available
                ? { accessToken: 'test-only-token', account: { id: 'account', label: 'test@example.test' } }
                : undefined;
        },
    },
});
mockModuleFor('services/StorageExplorer/graphClient.ts', 'vscode', {
    l10n: { t: (message: string) => message },
});
mockModuleFor('services/StorageExplorer/graphClient.ts', '../../client', { clientId: 'test-client' });
mockModuleFor('services/StorageExplorer/graphClient.ts', '../AuthenticationState', {
    AuthenticationState: {
        getCurrentAccountSync: () => ({ id: currentAccountId, username: 'test@example.test', tenantId: 'tenant' }),
    },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VSCodeAuthProvider }: typeof import('../../src/services/Auth/VSCodeAuthProvider') =
    require('../../src/services/Auth/VSCodeAuthProvider');
mockModuleFor('services/StorageExplorer/graphClient.ts', '../Auth', { VSCodeAuthProvider });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createGraphClient }: typeof import('../../src/services/StorageExplorer/graphClient') =
    require('../../src/services/StorageExplorer/graphClient');

test.beforeEach(() => {
    requests.length = 0;
    available = true;
    currentAccountId = 'account';
    onGetSession = () => {};
});

test('silent upload token acquisition pins the account and cannot request sign-in UI', async () => {
    const provider = new VSCodeAuthProvider({ clientId: 'test-client', scopes: ['https://graph.microsoft.com/.default'] });
    await expect(provider.getTokenSilently({ id: 'account', label: 'test@example.test' }))
        .resolves.toBe('test-only-token');
    expect(requests).toEqual([{ silent: true, account: { id: 'account', label: 'test@example.test' } }]);
});

test('an unavailable Graph session fails without interactive fallback or a network request', async () => {
    available = false;
    const client = createGraphClient(() => { /* no listener needed */ }, false);
    await expect(client.api('/drives/d1/root:/large.mp4:/content').put('test'))
        .rejects.toThrow('could not be refreshed silently');
    expect(requests).toHaveLength(1);
    expect(requests[0].silent).toBe(true);
    expect(requests[0].createIfNone).toBeUndefined();
    expect(requests[0].forceNewSession).toBeUndefined();
});

test('an account switch during silent acquisition rejects the token before sending the upload', async () => {
    onGetSession = () => { currentAccountId = 'other-account'; };
    const client = createGraphClient(() => {}, false);
    await expect(client.api('/drives/d1/root:/large.mp4:/content').put('test'))
        .rejects.toThrow('could not be refreshed silently');
    expect(requests).toEqual([{ silent: true, account: { id: 'account', label: 'test@example.test' } }]);
});

test('the real Graph SDK sends the staged Blob with silent Graph authentication and redacted logging', async () => {
    const fetch = globalThis.fetch;
    const controller = new AbortController();
    const logs: NetworkRequest[] = [];
    let puts = 0;
    globalThis.fetch = async (input, options) => {
        const url = new URL(String(input));
        expect(url.origin).toBe('https://graph.microsoft.com');
        expect(url.pathname).toBe('/v1.0/drives/d1/root:/large.mp4:/content');
        expect(url.searchParams.get('@microsoft.graph.conflictBehavior')).toBe('rename');
        expect(options?.method).toBe('PUT');
        expect(options?.signal).toBe(controller.signal);
        expect(new Headers(options?.headers).get('authorization')).toBe('Bearer test-only-token');
        expect(new Headers(options?.headers).get('content-type')).toBe('video/mp4');
        const body = options?.body;
        if (!(body instanceof Blob)) { throw new Error('SDK did not preserve the file-backed Blob'); }
        expect([...new Uint8Array(await body.arrayBuffer())]).toEqual([1, 2, 3]);
        puts++;
        return new Response(JSON.stringify({ id: 'uploaded', name: 'large.mp4', size: 3, file: { mimeType: 'video/mp4' } }), {
            status: 201, headers: { 'Content-Type': 'application/json' },
        });
    };
    const file = await createTemporaryGraphUpload(createGraphClient(request => logs.push(request), false));
    try {
        await file.append(new Uint8Array([1, 2, 3]));
        const result = await file.upload({
            driveId: 'd1', parentId: null, fileName: 'large.mp4', contentType: 'video/mp4', size: 3,
        }, controller.signal);
        expect(result.id).toBe('uploaded');
        expect(puts).toBe(1);
        expect(requests).toEqual([{ silent: true, account: { id: 'account', label: 'test@example.test' } }]);
        expect(logs).toHaveLength(1);
        expect(logs[0].requestBody).toBe('[3 bytes]');
        expect(JSON.stringify(logs)).not.toContain('test-only-token');
    } finally {
        globalThis.fetch = fetch;
        await file.dispose();
    }
});
