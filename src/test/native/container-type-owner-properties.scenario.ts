/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { createSandbox } from 'sinon';
import * as vscode from 'vscode';
import { ViewContainerTypeProperties } from '../../commands/ContainerType/ViewContainerTypeProperties';
import type { ContainerType, ContainerTypeOwnerPermission } from '../../models/schemas';
import { ContainerTypeService } from '../../services/Graph/ContainerTypeService';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const containerType: ContainerType = {
        id: 'demo-container-type',
        name: 'Owner demo',
        owningAppId: '00000000-0000-4000-8000-000000000001',
        billingClassification: 'trial',
        billingStatus: 'valid'
    };
    const ownerId = 'demo-owner-user-01';
    const permissions: ContainerTypeOwnerPermission[] = [
        { id: 'demo-owner-grant-01', roles: ['owner'], grantedToV2: { user: { id: ownerId } } }
    ];

    const sandbox = createSandbox();
    try {
        sandbox.stub(ContainerTypeService.prototype, 'get').withArgs(containerType.id).resolves(containerType);
        sandbox.stub(ContainerTypeService.prototype, 'listOwnerPermissions').withArgs(containerType.id).resolves(permissions);

        await captureWorkbench(async workbench => {
            await ViewContainerTypeProperties.run(new ContainerTypeTreeItem(containerType));
            const document = vscode.window.activeTextEditor?.document;
            ok(document, 'View Properties should open a document');
            strictEqual(document.languageId, 'json');
            deepStrictEqual(JSON.parse(document.getText()), { ...containerType, permissions });

            const ownerLine = workbench.locator('.view-line').filter({ hasText: `"${ownerId}"` });
            return workbench.locator('.monaco-editor').filter({ has: ownerLine });
        });
    } finally {
        sandbox.restore();
    }
}
