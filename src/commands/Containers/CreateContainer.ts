/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/ContainerType';
import { ContainersTreeItem } from '../../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { App } from '../../models/App';
import { GraphProvider } from '../../services/GraphProvider';
import { Container } from '../../models/Container';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import { CreateContainerEvent, CreateContainerFailure } from '../../models/telemetry/telemetry';

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
            placeHolder: 'Enter a display name for your new container',
            prompt: 'Container display name',
            validateInput: (value: string) => {
                if (!value) {
                    return 'display name is required';
                }
                return undefined;
            }
        });

        if (!containerDisplayName) {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Creating container');  
        progressWindow.show();
        try {
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProvider(authProvider);
            const container = await graphProvider.createContainer(containerTypeRegistration, containerDisplayName);
            if (!container) {
                throw new Error ("Failed to create container");
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containersViewModel);
            progressWindow.hide();
            TelemetryProvider.instance.send(new CreateContainerEvent());
            return container;
        } catch (error: any) {
            progressWindow.hide();
            vscode.window.showErrorMessage("Unable to create container object: " + error.message);
            TelemetryProvider.instance.send(new CreateContainerFailure(error.message));
            return;
        }
    }
}
