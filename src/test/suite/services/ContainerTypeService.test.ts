/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { Client, GraphRequest } from '@microsoft/microsoft-graph-client';
import { suite, test } from 'mocha';
import sinon from 'sinon';
import { containerTypePermissionSchema } from '../../../models/schemas';
import { ContainerTypeService } from '../../../services/Graph/ContainerTypeService';

const containerTypeResponse = {
    id: 'container-type-id',
    name: 'Test container type',
    owningAppId: '00000000-0000-4000-8000-000000000001',
    billingClassification: 'standard',
    billingStatus: 'valid'
};

const ownerPermissionResponse = {
    id: 'permission-id',
    roles: ['owner'],
    grantedToV2: {
        user: {
            id: 'user-id'
        }
    }
};

function createService(response: object) {
    const client = sinon.createStubInstance(Client);
    const request = sinon.createStubInstance(GraphRequest);

    client.api.returns(request);
    request.version.returns(request);
    request.header.returns(request);
    request.select.returns(request);
    request.expand.returns(request);
    request.get.resolves(response);

    return {
        service: new ContainerTypeService(client),
        client,
        request
    };
}

suite('ContainerTypeService', () => {
    test('uses beta and expands permissions for an explicit properties read', async () => {
        const response = {
            ...containerTypeResponse,
            permissions: [ownerPermissionResponse]
        };
        const { service, client, request } = createService(response);

        const result = await service.get(containerTypeResponse.id, {
            noCache: true,
            expand: ['permissions']
        });

        sinon.assert.calledOnceWithExactly(
            client.api,
            `/storage/fileStorage/containerTypes/${containerTypeResponse.id}`
        );
        sinon.assert.calledOnceWithExactly(request.version, 'beta');
        sinon.assert.calledOnceWithExactly(request.header, 'Cache-Control', 'no-cache');
        sinon.assert.calledOnceWithExactly(request.expand, 'permissions');
        expect(result).to.deep.equal(response);
    });

    test('keeps a normal container type read on v1.0 without permissions expansion', async () => {
        const { service, request } = createService(containerTypeResponse);

        const result = await service.get(containerTypeResponse.id);

        sinon.assert.calledOnceWithExactly(request.version, 'v1.0');
        sinon.assert.notCalled(request.expand);
        expect(result).to.deep.equal(containerTypeResponse);
    });

    test('parses the confirmed owner permission response shape', async () => {
        const { service, request } = createService({
            value: [ownerPermissionResponse]
        });

        const result = await service.listPermissions(containerTypeResponse.id);

        sinon.assert.calledOnceWithExactly(
            request.version,
            'beta'
        );
        expect(result).to.deep.equal([ownerPermissionResponse]);
        expect(containerTypePermissionSchema.safeParse({
            role: 'owner',
            principalId: 'user-id',
            principalType: 'user'
        }).success).to.equal(false);
    });
});
