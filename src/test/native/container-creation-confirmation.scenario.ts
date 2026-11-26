/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { Client } from '@microsoft/microsoft-graph-client';
import { createSandbox } from 'sinon';
import * as vscode from 'vscode';
import type { ContainerType } from '../../models/schemas';
import { AuthenticationState } from '../../services/AuthenticationState';
import { ContainerGraphService } from '../../services/StorageExplorer/ContainerGraphService';
import { DriveGraphService } from '../../services/StorageExplorer/DriveGraphService';
import * as graphClient from '../../services/StorageExplorer/graphClient';
import { containerToStorageItem } from '../../services/StorageExplorer/mappers';
import * as extensionAppPermissions from '../../utils/ExtensionAppPermissions';
import { StorageExplorerPanel } from '../../views/StorageExplorer/StorageExplorerPanel';
import { StorageExplorerTreeItem } from '../../views/treeview/development/StorageExplorerTreeItem';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const extension = vscode.extensions.getExtension('SharepointEmbedded.ms-sharepoint-embedded-vscode-extension');
    assert.ok(extension, 'SharePoint Embedded extension is not installed.');
    const containerType: ContainerType = {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Storage Explorer test',
        owningAppId: '00000000-0000-4000-8000-000000000002',
        billingClassification: 'trial',
        billingStatus: 'valid',
    };
    const containerName = 'Project files';
    const sandbox = createSandbox();
    try {
        sandbox.stub(AuthenticationState, 'initialize').resolves();
        sandbox.stub(AuthenticationState, 'getCurrentAccountSync').returns(undefined);
        sandbox.stub(graphClient, 'createGraphClient').returns(Client.initWithMiddleware({
            middleware: { execute: async () => { throw new Error('Unexpected Graph request in offline fixture.'); } },
        }));
        sandbox.stub(extensionAppPermissions, 'readGrantedExtensionAppScopes').resolves(['full']);
        sandbox.stub(ContainerGraphService.prototype, 'list').resolves({ items: [] });
        sandbox.stub(ContainerGraphService.prototype, 'create').callsFake(async (containerTypeId, displayName) =>
            containerToStorageItem({ id: 'fixture-container', containerTypeId, displayName, status: 'active' })
        );
        sandbox.stub(DriveGraphService.prototype, 'listChildren').resolves({ items: [] });
        await extension.activate();

        await captureWorkbench(async workbench => {
            await vscode.commands.executeCommand(
                'spe.ContainerType.openStorageExplorer',
                new StorageExplorerTreeItem(containerType, { ...containerType, settings: {} }, 'ready')
            );
            const view = workbench.frameLocator('iframe.webview').frameLocator('#active-frame');
            await view.getByTestId('action-new-container').click({ timeout: 30_000 });
            await view.getByTestId('new-container-name-input').fill(containerName);
            await view.getByTestId('modal-confirm').click();
            return workbench.locator('.notifications-toasts .notification-list-item').filter({
                has: workbench.getByText('Container created successfully.', { exact: true }),
            });
        });
    } finally {
        StorageExplorerPanel.closeForContainerType(containerType.id);
        sandbox.restore();
    }
}
