import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { SinonSandbox } from 'sinon';
import { OpenStorageExplorer } from '../../../commands/ContainerType/OpenStorageExplorer';
import type { ContainerType } from '../../../models/schemas';
import { AuthenticationState } from '../../../services/AuthenticationState';
import { ContainerGraphService } from '../../../services/StorageExplorer/ContainerGraphService';
import { DriveGraphService } from '../../../services/StorageExplorer/DriveGraphService';
import type { RpcRequestMessage, StorageItem } from '../../../services/StorageExplorer/protocol';
import * as extensionAppPermissions from '../../../utils/ExtensionAppPermissions';
import { StorageExplorerPanel } from '../../../views/StorageExplorer/StorageExplorerPanel';
import { StorageExplorerTreeItem } from '../../../views/treeview/development/StorageExplorerTreeItem';

export const containerType: ContainerType = {
    id: '00000000-0000-4000-8000-000000000081',
    owningAppId: '00000000-0000-4000-8000-000000000082',
    name: 'Storage Explorer test',
    billingStatus: 'valid',
    billingClassification: 'trial',
};

export const createdContainer: StorageItem = {
    id: 'test-container',
    name: 'Project files',
    kind: 'container',
    modifiedAt: '',
    type: 'Container',
    size: '',
    status: 'active',
};

export async function openStorageExplorer(sandbox: SinonSandbox): Promise<StorageExplorerPanel> {
    sandbox.stub(AuthenticationState, 'initialize').resolves();
    sandbox.stub(AuthenticationState, 'getCurrentAccountSync').returns(undefined);
    sandbox.stub(extensionAppPermissions, 'readGrantedExtensionAppScopes').resolves(['full']);
    sandbox.stub(ContainerGraphService.prototype, 'list').resolves({ items: [] });
    sandbox.stub(DriveGraphService.prototype, 'listChildren').resolves({ items: [] });

    const extension = vscode.extensions.getExtension('SharepointEmbedded.ms-sharepoint-embedded-vscode-extension');
    assert.ok(extension, 'SharePoint Embedded extension is installed');
    await extension.activate();
    await OpenStorageExplorer.run(new StorageExplorerTreeItem(containerType, null, 'ready'));
    const panel = StorageExplorerPanel['_panels'].get(`ct:${containerType.id}`);
    assert.ok(panel, 'Storage Explorer panel is open');
    return panel;
}

export function requestContainerCreation(panel: StorageExplorerPanel): Promise<void> {
    const request: RpcRequestMessage = {
        command: 'rpc/request', requestId: 'create-test', op: 'containers.create',
        params: { displayName: createdContainer.name },
    };
    return panel['_handleMessage'](request);
}
