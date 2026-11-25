/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { type ContainerType, containerTypeSchema } from '../../models/schemas';
import { ContainerTypeService } from '../../services/Graph/ContainerTypeService';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const containerType: ContainerType = {
        id: 'ct-evidence',
        name: 'Contoso Documents',
        owningAppId: '00000000-0000-4000-8000-000000000001',
        billingClassification: 'standard',
        billingStatus: 'valid',
    };
    const ownerId = '00000000-0000-4000-8000-000000000002';
    const permissions = [{ id: 'permission-1', roles: ['owner'], grantedToV2: { user: { id: ownerId } } }];
    const get = sinon.stub(ContainerTypeService.prototype, 'get').callsFake(async (id, options) => {
        if (id !== containerType.id) {
            throw new Error(`Unexpected container type: ${id}`);
        }
        return options?.expandPermissions ? { ...containerType, permissions } : containerType;
    });

    try {
        await vscode.commands.executeCommand('spe.ContainerType.viewProperties', new ContainerTypeTreeItem(containerType));
        const document = vscode.window.activeTextEditor?.document;
        assert.ok(document, 'View properties should open an editor');
        assert.equal(document.uri.path, '/Contoso Documents.json');
        assert.equal(document.languageId, 'json');
        const properties = containerTypeSchema.parse(JSON.parse(document.getText()));
        assert.deepEqual(properties.permissions, permissions);

        await captureWorkbench(async workbench => workbench.locator('.monaco-editor .view-lines').filter({ hasText: ownerId }));
    } finally {
        get.restore();
    }
}
