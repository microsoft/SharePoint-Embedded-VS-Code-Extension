/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'node:assert/strict';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ViewContainerTypeProperties } from '../../commands/ContainerType/ViewContainerTypeProperties';
import { ContainerType } from '../../models/schemas';
import { ContainerTypeService } from '../../services/Graph/ContainerTypeService';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const containerType: ContainerType = {
        id: 'a0e14960-1d3b-4479-a6b8-a12077da10e9',
        name: 'Owner properties fixture',
        owningAppId: '79c8127e-18ba-41f0-a253-65b822c42b15',
        billingClassification: 'standard',
        billingStatus: 'valid'
    };
    const firstOwnerId = '104441a4-4c0c-46c3-827d-3183f397b619';
    const secondOwnerId = 'ec73e647-5c49-420e-9205-c391bba11b6a';
    const get = sinon.stub(ContainerTypeService.prototype, 'get').resolves({
        ...containerType,
        permissions: [
            { id: 'permission-1', roles: ['owner'], grantedToV2: { user: { id: firstOwnerId } } },
            { id: 'permission-2', roles: ['read', 'owner'], grantedToV2: { user: { id: secondOwnerId } } },
            { id: 'permission-3', roles: ['read'], grantedToV2: { user: { id: 'non-owner-user' } } }
        ]
    });

    try {
        await captureWorkbench(async workbench => {
            await ViewContainerTypeProperties.run(new ContainerTypeTreeItem(containerType));
            sinon.assert.calledOnceWithExactly(get, containerType.id, { noCache: true, expandPermissions: true });

            const doc = vscode.window.activeTextEditor?.document;
            assert.ok(doc, 'View properties should open a document');
            assert.equal(doc.uri.scheme, 'virtual');
            assert.equal(doc.languageId, 'json');
            const properties: unknown = JSON.parse(doc.getText());
            assert.ok(properties && typeof properties === 'object' && 'owners' in properties);
            const { owners, ...details } = properties;
            assert.ok(Array.isArray(owners));
            assert.equal(owners.length, 2);
            assert.deepEqual(new Set(owners), new Set([firstOwnerId, secondOwnerId]));
            assert.deepEqual(details, containerType);

            return workbench.locator('.monaco-editor .view-lines')
                .filter({ hasText: '"owners"' })
                .filter({ hasText: firstOwnerId })
                .filter({ hasText: secondOwnerId });
        });
    } finally {
        get.restore();
    }
}
