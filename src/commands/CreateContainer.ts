/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './Command';
import * as vscode from 'vscode';
import { ContainerType } from '../models/ContainerType';
import { ContainersTreeItem } from '../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';
import { Account } from '../models/Account';
import { App } from '../models/App';
import { GraphProviderNew } from '../services/GraphProviderNew';
import { Container } from '../models/Container';

// Static class that handles the create container command
export class CreateContainer extends Command {
    // Command name
    public static readonly COMMAND = 'createContainer';

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

        vscode.window.showInformationMessage(`Container creation starting...`);
        try {
            const authProvider = owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            const container = await graphProvider.createContainer(containerTypeRegistration, containerDisplayName);
            DevelopmentTreeViewProvider.getInstance().refresh(containersViewModel);
            return container;
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create container object: " + error.message);
            return;
        }
    }
}
