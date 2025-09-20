/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType, Application } from '../../models/schemas';
import { Container } from '../../models/Container';
import { ContainersTreeItem } from '../../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GraphProvider } from '../../services/Graph';
import { AuthenticationState } from '../../services/AuthenticationState';
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
        
        // Check authentication
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to create a container.');
            return;
        }
        
        const graphProvider = GraphProvider.getInstance();
        const containerDisplayName = await vscode.window.showInputBox({
            placeHolder: vscode.l10n.t('Enter a display name for your new container'),
            prompt: vscode.l10n.t('Container display name'),
            validateInput: (value: string) => {
                const maxLength = 50;
                const alphanumericRegex = /^[a-zA-Z0-9\s-_]+$/;
                if (!value) {
                    return vscode.l10n.t('Display name cannot be empty');
                }
                if (value.length > maxLength) {
                    return vscode.l10n.t(`Display name must be no more than {0} characters long`, maxLength);
                }
                if (!alphanumericRegex.test(value)) {
                    return vscode.l10n.t('Display name must only contain alphanumeric characters');
                }
                return undefined;
            }
        });

        if (!containerDisplayName) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating container...'));  
        progressWindow.show();
        try {
            // TODO: Implement container creation in GraphProvider
            // For now, use a placeholder implementation
            const container = await createContainerPlaceholder(graphProvider, containerTypeRegistration, containerDisplayName);
            if (!container) {
                throw new Error (vscode.l10n.t('Failed to create container'));
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containersViewModel);
            progressWindow.hide();
            TelemetryProvider.instance.send(new CreateContainerEvent());
            return container;
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to create container object: {0}', error.message);
            vscode.window.showErrorMessage(message);
            TelemetryProvider.instance.send(new CreateContainerFailure(error.message));
            return;
        }
    }
}

/**
 * Placeholder implementation for container creation
 * TODO: Implement proper container creation in GraphProvider
 */
async function createContainerPlaceholder(graphProvider: GraphProvider, containerTypeRegistration: any, containerDisplayName: string): Promise<Container | undefined> {
    // This is a placeholder - actual implementation would need to be added to GraphProvider
    // For now, return undefined to indicate containers service is not yet implemented
    vscode.window.showWarningMessage('Container creation is not yet implemented in the new authentication system.');
    return undefined;
}
