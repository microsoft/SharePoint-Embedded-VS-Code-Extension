/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import { StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import { OPERATION_SCHEMAS } from '../../src/services/StorageExplorer/operationSchemas';
import { FakeGraphClient } from './fakeClient';

for (const operation of ['drive.openPdf', 'drive.openVideo'] as const) {
    test.describe(operation, () => {
        let fake: FakeGraphClient;
        let api: StorageExplorerApi;
        let granted: boolean;
        let opened: string[];
        const context = {
            onProgress: () => undefined,
            openPreview: async (url: string) => { opened.push(url); return true; },
        };
        const params = { driveId: 'd1', itemId: 'i1' };

        test.beforeEach(() => {
            fake = new FakeGraphClient();
            granted = true;
            opened = [];
            fake.responder = call => call.path.includes('/storage/fileStorage/containers/')
                ? { containerTypeId: 'ct1' }
                : { getUrl: `https://contoso.sharepoint.com/preview?opaque=a%2Fb+z&request=${fake.calls.length}#page=1` };
            api = new StorageExplorerApi('ct1', fake as unknown as Client, async () => granted ? ['readContent'] : ['read']);
        });

        test.afterEach(async () => { await api.dispose(); });

        test('opens only fresh, unmodified Graph /preview URLs; never streams or downloads bytes', async () => {
            expect(await api.execute(operation, params, context)).toBeUndefined();
            expect(await api.execute(operation, params, context)).toBeUndefined();
            expect(opened).toEqual([
                'https://contoso.sharepoint.com/preview?opaque=a%2Fb+z&request=2#page=1',
                'https://contoso.sharepoint.com/preview?opaque=a%2Fb+z&request=3#page=1',
            ]);
            expect(fake.calls.map(call => ({ method: call.method, path: call.path, body: call.body }))).toEqual([
                { method: 'GET', path: '/storage/fileStorage/containers/d1', body: undefined },
                { method: 'POST', path: '/drives/d1/items/i1/preview', body: {} },
                { method: 'POST', path: '/drives/d1/items/i1/preview', body: {} },
            ]);
        });

        test('validates identifiers and denies missing readContent before Graph or browser access', async () => {
            expect(OPERATION_SCHEMAS[operation].safeParse({ ...params, itemId: '../other' }).success).toBe(false);
            await expect(api.execute(operation, { ...params, itemId: '../other' }, context)).rejects.toThrow();
            granted = false;
            await expect(api.execute(operation, params, context)).rejects.toMatchObject({
                code: 'missingExtensionAppPermissions', requiredScopes: ['readContent'],
            });
            expect(fake.calls).toHaveLength(0);
            expect(opened).toHaveLength(0);
        });

        test('rejects containers outside the panel scope before requesting a preview', async () => {
            fake.responder = () => ({ containerTypeId: 'another-type' });
            await expect(api.execute(operation, params, context)).rejects.toThrow();
            expect(fake.calls).toHaveLength(1);
            expect(opened).toHaveLength(0);
        });

        for (const response of [{}, { getUrl: '' }, { getUrl: 'invalid' }]) {
            test(`rejects invalid preview responses (${JSON.stringify(response)}) without a fallback`, async () => {
                fake.responder = call => call.path.includes('/storage/fileStorage/containers/')
                    ? { containerTypeId: 'ct1' } : response;
                await expect(api.execute(operation, params, context)).rejects.toThrow('No valid preview URL');
                expect(opened).toHaveLength(0);
                expect(fake.calls.map(call => call.path)).toEqual([
                    '/storage/fileStorage/containers/d1', '/drives/d1/items/i1/preview',
                ]);
            });
        }

        test('propagates preview denial without falling back, then retries with a fresh request', async () => {
            const respond = fake.responder;
            let denied = true;
            fake.responder = call => {
                if (call.path.endsWith('/preview') && denied) { throw new Error('Preview unavailable'); }
                return respond(call);
            };
            await expect(api.execute(operation, params, context)).rejects.toThrow('Preview unavailable');
            expect(opened).toHaveLength(0);
            denied = false;
            await api.execute(operation, params, context);
            expect(opened).toHaveLength(1);
            expect(fake.calls.filter(call => call.path.endsWith('/preview'))).toHaveLength(2);
            expect(fake.calls.some(call => /content|download/i.test(call.path))).toBe(false);
        });

        test('does not open a URL if readContent is revoked while Graph resolves it', async () => {
            const respond = fake.responder;
            fake.responder = call => {
                if (call.path.endsWith('/preview')) { granted = false; }
                return respond(call);
            };
            await expect(api.execute(operation, params, context)).rejects.toMatchObject({
                code: 'missingExtensionAppPermissions', requiredScopes: ['readContent'],
            });
            expect(opened).toHaveLength(0);
        });

        test('reports a rejected browser launch without a download fallback', async () => {
            await expect(api.execute(operation, params, { ...context, openPreview: async () => false }))
                .rejects.toThrow('Could not open the file preview');
            expect(fake.last.path).toBe('/drives/d1/items/i1/preview');
        });

        test('fails without a host opener rather than silently succeeding', async () => {
            await expect(api.execute(operation, params, { onProgress: () => undefined }))
                .rejects.toThrow('File preview requires');
            expect(fake.calls.some(call => call.path.endsWith('/preview'))).toBe(false);
        });
    });
}
