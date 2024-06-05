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

// Static class that handles the restore container command
export class RestoreContainer extends Command {
    // Command name
    public static readonly COMMAND = 'RecycledContainer.restore';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;

        const progressWindow = new ProgressWaitNotification('Restoring container');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProvider(authProvider);
            await graphProvider.restoreContainer(containerTypeRegistration, container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to restore container object: " + error.message);
            return;
        }
    }
}
