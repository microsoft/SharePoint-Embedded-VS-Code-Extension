/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import { ContainerTypeService } from '../../src/services/Graph/ContainerTypeService';
import { FakeGraphClient } from './fakeClient';

const containerType = {
    id: 'ct-1',
    name: 'Contoso Documents',
    owningAppId: '00000000-0000-4000-8000-000000000001',
    billingClassification: 'standard',
    billingStatus: 'valid',
};
const path = `/storage/fileStorage/containerTypes/${containerType.id}`;
const permissions = [
    { id: 'permission-1', roles: ['owner'], grantedToV2: { user: { id: 'owner-1' } } },
    { id: 'permission-2', roles: ['owner'], grantedToV2: { user: { id: 'owner-2' } } },
];

function setup() {
    const fake = new FakeGraphClient();
    return { fake, service: new ContainerTypeService(fake as unknown as Client) };
}

test('ordinary container type reads stay on v1.0 without expanding permissions', async () => {
    const { fake, service } = setup();
    fake.responder = () => containerType;

    const result = await service.get(containerType.id);

    expect(fake.calls).toEqual([{ method: 'GET', path, version: 'v1.0', headers: {} }]);
    expect(result).toEqual(containerType);
});

test('expanded container type reads request beta permissions and preserve the owner IDs', async () => {
    const { fake, service } = setup();
    fake.responder = () => ({ ...containerType, permissions });

    const result = await service.get(containerType.id, { expandPermissions: true, noCache: true });

    expect(fake.calls).toEqual([{
        method: 'GET', path, version: 'beta', expand: 'permissions', headers: { 'Cache-Control': 'no-cache' },
    }]);
    expect(result).toEqual({ ...containerType, permissions });
});

test('an expanded permission must identify its user', async () => {
    const { fake, service } = setup();
    fake.responder = () => ({
        ...containerType,
        permissions: [{ id: 'permission-1', roles: ['owner'], grantedToV2: { user: {} } }],
    });

    await expect(service.get(containerType.id, { expandPermissions: true })).rejects.toThrow('grantedToV2');
});
