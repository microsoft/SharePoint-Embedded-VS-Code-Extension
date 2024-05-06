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

        const containerTypeDisplayName = await vscode.window.showInputBox({
            prompt: 'New display name:'
        });

        if (!containerTypeDisplayName) {
            vscode.window.showErrorMessage('No container type display name provided');
            return;
        }

        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;
        const containerTypeProvider = account.containerTypeProvider;
        const progressWindow = new ProgressWaitNotification('Renaming container type');
        progressWindow.show();
        await containerTypeProvider.setContainerTypeProperties(containerType, undefined, containerTypeDisplayName);
        const ctRefreshTimer = new Timer(60 * 1000);
        const refreshCt = async (): Promise<void> => {
            DevelopmentTreeViewProvider.instance.refresh();
            do {
                const containerTypes = await containerTypeProvider.list();
                if (containerTypes.find(ct => ct.displayName === containerTypeDisplayName)) {
                    break;
                }
                // sleep for 5 seconds
                await new Promise(r => setTimeout(r, 5000));
            } while (!ctRefreshTimer.finished);
            DevelopmentTreeViewProvider.getInstance().refresh();
            progressWindow.hide();
        };
        refreshCt();
    }
}