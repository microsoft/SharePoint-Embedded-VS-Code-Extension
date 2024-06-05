/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Account } from '../../models/Account';
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

        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;

        const containerTypeDisplayName = await vscode.window.showInputBox({
            title: 'New display name:',
            value: containerType.displayName,
            prompt: 'Enter the new display name for the container type:',
            validateInput: (value: string): string | undefined => {
                if (!value) {
                    return 'Display name cannot be empty';
                }
                return undefined;
            }
        });

        if (containerTypeDisplayName === undefined) {
            return;
        }

        if (containerTypeDisplayName === '') {
            vscode.window.showWarningMessage('Container type display name cannot be empty');
            return;
        }

        const containerTypeProvider = account.containerTypeProvider;
        const progressWindow = new ProgressWaitNotification('Renaming container type (may take a minute)...');
        progressWindow.show();
        try {
            await containerTypeProvider.rename(containerType, containerTypeDisplayName);
            const ctRefreshTimer = new Timer(60 * 1000);
            const refreshCt = async (): Promise<void> => {
                do {
                    const containerTypes = await containerTypeProvider.list();
                    if (containerTypes.find(ct => 
                        ct.containerTypeId === containerType.containerTypeId &&
                        ct.displayName === containerTypeDisplayName)
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
            vscode.window.showErrorMessage(`Failed to rename container type: ${error}`);
        }
        
    }
}