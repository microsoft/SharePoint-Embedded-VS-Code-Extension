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

// Static class that handles the edit container description command
export class EditContainerDescription extends Command {
    // Command name
    public static readonly COMMAND = 'Container.editDescription';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<Container | undefined> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;
        const containerDescription = await vscode.window.showInputBox({
            title: 'New description',
            value: container.description,
            prompt: 'Enter the new description for the container:',

        });

        if (containerDescription === undefined) {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Saving new container description...');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            const updatedContainer = await graphProvider.updateContainer(containerTypeRegistration, container.id, container.displayName, containerDescription || '');
            if (!updatedContainer) {
                throw new Error ("Failed to change container description");
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
            return updatedContainer;
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to edit container object: " + error.message);
            return;
        }
    }
}
