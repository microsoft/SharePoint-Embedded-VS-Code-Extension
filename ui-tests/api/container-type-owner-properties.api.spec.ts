/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client } from '@microsoft/microsoft-graph-client';
import { test, expect } from '@playwright/test';
import { ZodError } from 'zod';
import { ContainerTypeService } from '../../src/services/Graph/ContainerTypeService';

const containerType = {
    id: 'ct-1',
    name: 'Example container type',
    owningAppId: '79c8127e-18ba-41f0-a253-65b822c42b15',
    billingClassification: 'standard',
    billingStatus: 'valid'
};
const ownerPermission = {
    id: 'permission-1',
    roles: ['owner'],
    grantedToV2: { user: { id: '104441a4-4c0c-46c3-827d-3183f397b619' } }
};
const path = `/storage/fileStorage/containerTypes/${containerType.id}`;

function setup(response: object) {
    const requests: { url: URL; cacheControl: string | null }[] = [];
    const client = Client.initWithMiddleware({
        middleware: {
            // Return synthetic data before the SDK reaches any authentication or HTTP handler.
            async execute(context) {
                const { request, options } = context;
                const url = new URL(typeof request === 'string' ? request : request.url);
                const headers = new Headers(options?.headers ?? (typeof request === 'string' ? undefined : request.headers));
                requests.push({ url, cacheControl: headers.get('Cache-Control') });
                context.response = new Response(JSON.stringify(response), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
    });
    return { service: new ContainerTypeService(client), requests };
}

test('ordinary container type reads use v1.0 without expanding permissions', async () => {
    const { service, requests } = setup(containerType);
    expect(await service.get(containerType.id)).toEqual(containerType);
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe(`/v1.0${path}`);
    expect(requests[0].url.searchParams.has('$expand')).toBe(false);
});

test('expanding permissions opts into beta and returns validated owner entries', async () => {
    const { service, requests } = setup({
        ...containerType,
        permissions: [{ ...ownerPermission, grantedToV2: { user: { ...ownerPermission.grantedToV2.user, displayName: 'Synthetic owner' } } }]
    });

    expect(await service.get(containerType.id, { noCache: true, expandPermissions: true }))
        .toEqual({ ...containerType, permissions: [ownerPermission] });
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe(`/beta${path}`);
    expect(requests[0].url.searchParams.get('$expand')).toBe('permissions');
    expect(requests[0].cacheControl).toBe('no-cache');
});

test('rejects expanded permissions without a record ID, roles array, or grantee user ID', async () => {
    for (const permission of [
        { ...ownerPermission, id: undefined },
        { ...ownerPermission, roles: 'owner' },
        { ...ownerPermission, grantedToV2: { user: {} } }
    ]) {
        const { service } = setup({ ...containerType, permissions: [permission] });
        await expect(service.get(containerType.id, { expandPermissions: true })).rejects.toThrow(ZodError);
    }
});
