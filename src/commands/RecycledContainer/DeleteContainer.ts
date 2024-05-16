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
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';
import { RecycledContainerTreeItem } from '../../views/treeview/development/RecycledContainerTreeItem';

// Static class that handles the recycle container command
export class DeleteContainer extends Command {
    // Command name
    public static readonly COMMAND = 'RecycledContainer.delete';

    // Command handler
    public static async run(containerViewModel?: RecycledContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;

        const message = "Are you sure you want to permanently delete this container? This is an unrecoverable operation.";
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Deleting container');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            await graphProvider.deleteContainer(container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to delete container object: " + error.message);
            return;
        }
    }
}
