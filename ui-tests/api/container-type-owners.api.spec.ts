/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Client, GraphRequest } from '@microsoft/microsoft-graph-client';
import { createStubInstance } from 'sinon';
import { ContainerTypeService } from '../../src/services/Graph/ContainerTypeService';

const containerType = {
    id: 'ct-1',
    name: 'Owner demo',
    owningAppId: '00000000-0000-4000-8000-000000000001',
    billingClassification: 'trial',
    billingStatus: 'valid'
};
const base = '/storage/fileStorage/containerTypes';

function setup(response: unknown) {
    const client = createStubInstance(Client);
    const request = createStubInstance(GraphRequest);
    client.api.returns(request);
    request.version.returnsThis();
    request.header.returnsThis();
    request.get.resolves(response);
    return { client, request, service: new ContainerTypeService(client) };
}

test('ordinary container type gets still request v1.0 without expanding permissions', async () => {
    const { client, request, service } = setup(containerType);

    await expect(service.get(containerType.id, { noCache: true })).resolves.toEqual(containerType);
    expect(client.api.calledOnceWithExactly(`${base}/${containerType.id}`)).toBe(true);
    expect(request.version.calledOnceWithExactly('v1.0')).toBe(true);
    expect(request.expand.notCalled).toBe(true);
});

test('owner permissions come from beta and preserve the required grant fields', async () => {
    const owners = [
        { id: 'grant-1', roles: ['owner'], grantedToV2: { user: { id: 'owner-1' } } },
        { id: 'grant-2', roles: ['owner'], grantedToV2: { user: { id: 'owner-2' } } }
    ];
    const { client, request, service } = setup({ value: owners });

    await expect(service.listOwnerPermissions(containerType.id)).resolves.toEqual(owners);
    expect(client.api.calledOnceWithExactly(`${base}/${containerType.id}/permissions`)).toBe(true);
    expect(request.version.calledOnceWithExactly('beta')).toBe(true);
    expect(request.get.calledOnce).toBe(true);
});

test('an empty permissions collection is valid, but a missing collection is not', async () => {
    const { request, service } = setup({ value: [] });
    await expect(service.listOwnerPermissions(containerType.id)).resolves.toEqual([]);

    request.get.resolves({});
    await expect(service.listOwnerPermissions(containerType.id)).rejects.toThrow('value');
});

test('an owner grant without a user id is not shown as a validated grant', async () => {
    const { service } = setup({ value: [{ id: 'grant-1', roles: ['owner'], grantedToV2: { user: {} } }] });
    await expect(service.listOwnerPermissions(containerType.id)).rejects.toThrow('grantedToV2');
});
