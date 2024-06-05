/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { App } from '../../models/App';
import { GraphProvider } from '../../services/GraphProvider';
import { Container } from '../../models/Container';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';

// Static class that handles the recycle container command
export class RecycleContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Container.recycle';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;

        const message = "Are you sure you want to recycle this container?";
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Recycling container');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProvider(authProvider);
            await graphProvider.recycleContainer(container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to recycle container object: " + error.message);
            return;
        }
    }
}
