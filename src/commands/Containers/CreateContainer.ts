/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/ContainerType';
import { ContainersTreeItem } from '../../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { Account } from '../../models/Account';
import { App } from '../../models/App';
import { GraphProviderNew } from '../../services/GraphProviderNew';
import { Container } from '../../models/Container';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the create container command
export class CreateContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Containers.create';

    // Command handler
    public static async run(containersViewModel?: ContainersTreeItem): Promise<Container | undefined> {
        if (!containersViewModel) {
            return;
        }
        const containerType: ContainerType = containersViewModel.containerType;
        const containerTypeRegistration = containersViewModel.containerTypeRegistration;
        const owningApp: App = containerType.owningApp!;
        const containerDisplayName = await vscode.window.showInputBox({
            prompt: 'Display name:'
        });

        if (!containerDisplayName) {
            vscode.window.showErrorMessage('No container display name provided');
            return;
        }

        const progressWindow = new ProgressWaitNotification('Creating container');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            const container = await graphProvider.createContainer(containerTypeRegistration, containerDisplayName);
            if (!container) {
                throw new Error ("Failed to create container");
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containersViewModel);
            progressWindow.hide();
            return container;
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to create container object: " + error.message);
            return;
        }
    }
}
