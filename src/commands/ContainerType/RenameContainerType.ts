/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GraphAuthProvider } from '../../services/Auth/GraphAuthProvider';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { Command } from '../Command';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the rename application command
export class RenameContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.rename';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        // Get authentication and Graph provider
        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in first'));
            return;
        }

        const graphAuth = GraphAuthProvider.getInstance();
        const graphProvider = GraphProvider.getInstance();
        const containerType = containerTypeViewModel.containerType;

        const containerTypeDisplayName = await vscode.window.showInputBox({
            title: vscode.l10n.t('New display name:'),
            value: containerType.name,
            prompt: vscode.l10n.t('Enter the new display name for the container type:'),
            validateInput: (value: string): string | undefined => {
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

        if (containerTypeDisplayName === undefined) {
            return;
        }

        if (containerTypeDisplayName === '') {
            vscode.window.showWarningMessage(vscode.l10n.t('Container type display name cannot be empty'));
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Renaming container type (may take a minute)...'));
        progressWindow.show();
        try {
            // Update the container type display name using the new service
            // Note: We need the current etag for the update operation
            const currentContainerType = await graphProvider.containerTypes.get(containerType.id);
            if (!currentContainerType) {
                throw new Error('Container type not found');
            }

            // Update the container type
            await graphProvider.containerTypes.update(
                containerType.id, 
                { name: containerTypeDisplayName },
                currentContainerType.etag || ''
            );

            const ctRefreshTimer = new Timer(60 * 1000);
            const refreshCt = async (): Promise<void> => {
                do {
                    const containerTypes = await graphProvider.containerTypes.list();
                    if (containerTypes.find((ct) => 
                        ct.id === containerType.id &&
                        ct.name === containerTypeDisplayName)
                    ) {
                        DevelopmentTreeViewProvider.instance.refresh();
                        setTimeout(() => DevelopmentTreeViewProvider.instance.refresh(), 3000);
                        break;
                    }
                    // sleep for 2 seconds
                    await new Promise(r => setTimeout(r, 2000));
                } while (!ctRefreshTimer.finished);
                
                progressWindow.hide();
            };
            refreshCt();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to rename container type: {0}', error);
            vscode.window.showErrorMessage(message);
        }
        
    }
}