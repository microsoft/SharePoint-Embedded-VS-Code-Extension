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

// Static class that handles the rename container command
export class RenameContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Container.rename';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<Container | undefined> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;
        const containerDisplayName = await vscode.window.showInputBox({
            title: 'New display name:',
            value: container.displayName,
            prompt: 'Enter the new display name for the container:',
            validateInput: (value: string): string | undefined => {
                if (!value) {
                    return 'Display name cannot be empty';
                }
                return undefined;
            }
        });

        if (containerDisplayName === undefined) {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Renaming container');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            const updatedContainer = await graphProvider.updateContainer(containerTypeRegistration, container.id, containerDisplayName, '');
            if (!updatedContainer) {
                throw new Error ("Failed to create container");
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.containersViewModel);
            progressWindow.hide();
            return updatedContainer;
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to rename container object: " + error.message);
            return;
        }
    }
}
