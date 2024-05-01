/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { Account } from '../../models/Account';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the delete container type command
export class DeleteContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.delete';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const message = "Are you sure you delete this Container Type?";
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;

        try {
            const containerTypeProvider = account.containerTypeProvider;
            containerTypeProvider.delete(containerType);

            let remainingAttempts = 5;
            let waittime = 2000;
            const interval = setInterval(async () => {
                if (remainingAttempts-- === 0) {
                    clearInterval(interval);
                }
                const containerTypes = await containerTypeProvider.list();
                if (!containerTypes.find(ct => ct.containerTypeId === containerType.containerTypeId)) {
                    clearInterval(interval);
                    DevelopmentTreeViewProvider.instance.refresh();
                }
            }, waittime);
            DevelopmentTreeViewProvider.instance.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to delete Container Type ${containerType.displayName} : ${error.message}`);
            return;
        }
    }
}
