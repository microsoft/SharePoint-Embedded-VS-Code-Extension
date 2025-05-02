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
import { GetAccount } from '../Accounts/GetAccount';

// Static class that handles the create container command
export class CreateContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Containers.create';

    // Command handler
    public static async run(containersViewModel?: ContainersTreeItem): Promise<Container | undefined> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let containerType: ContainerType | undefined;
        if (containersViewModel instanceof ContainersTreeItem) {
            containerType = containersViewModel.containerType;
        } else if ((containersViewModel as any) instanceof ContainerType) {
            containerType = containersViewModel;
        }
        if (!containerType) {
            // No arguments passed -- let the user choose from their existing container types
            try {
                const containerTypeProvider = account.containerTypeProvider;
                const containerTypes = await containerTypeProvider.list();
                if (!containerTypes || containerTypes.length === 0) {
                    vscode.window.showErrorMessage('No container types found');
                    return;
                }
                class ContainerTypeQuickPickItem implements vscode.QuickPickItem {
                    label: string;
                    description: string;
                    containerType: ContainerType;
                    constructor(containerType: ContainerType) {
                        this.label = containerType.displayName;
                        this.description = containerType.isTrial ? 'Trial' : 'Paid';
                        this.containerType = containerType;
                    }
                }
                const options: ContainerTypeQuickPickItem[] = containerTypes.map((ct) => {
                    return new ContainerTypeQuickPickItem(ct);
                });
                const selected = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Select a container type to create a new container with'
                });
                if (!selected) {
                    return;
                }
                containerType = selected.containerType;
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to fetch container types: ${error.message}`);
                return;
            }
        }

        if (!containerType) {
            return;
        }

        await containerType.loadOwningApp();
        await containerType.loadLocalRegistration();

        if (!containerType.owningApp || !containerType.localRegistration) {
            vscode.window.showErrorMessage(vscode.l10n.t('Unable to load container type information'));
            return;
        }

        const containerTypeRegistration = containerType.localRegistration!;
        const owningApp: App = containerType.owningApp!;
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
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProvider(authProvider);
            const container = await graphProvider.createContainer(containerTypeRegistration, containerDisplayName);
            if (!container) {
                throw new Error(vscode.l10n.t('Failed to create container'));
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containersViewModel);
            vscode.commands.executeCommand('setContext', 'spe:hasContainers', true);
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
