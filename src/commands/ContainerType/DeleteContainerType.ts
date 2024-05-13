/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { Account } from '../../models/Account';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { ContainerType } from '../../models/ContainerType';
import { GetAccount } from '../Accounts/GetAccount';

// Static class that handles the delete container type command
export class DeleteContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.delete';

    // Command handler
    public static async run(commandProps?: DeletionCommandProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let containerType: ContainerType;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else {
            containerType = commandProps;
        }
        if (!containerType) {
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

        const progressWindow = new ProgressWaitNotification('Deleting container type');

        try {    
            progressWindow.show();
            const containerTypeProvider = account.containerTypeProvider;
            await containerTypeProvider.delete(containerType);
            const ctRefreshTimer = new Timer(60 * 1000);
            const refreshCt = async (): Promise<void> => {
                DevelopmentTreeViewProvider.instance.refresh();
                do {
                    const containerTypes = await containerTypeProvider.list();
                    if (!containerTypes.find(ct => ct.containerTypeId === containerType.containerTypeId)) {
                        break;
                    }
                    // sleep for 5 seconds
                    await new Promise(r => setTimeout(r, 5000));
                } while (!ctRefreshTimer.finished);
                progressWindow.hide();
                DevelopmentTreeViewProvider.instance.refresh();
            };
            refreshCt();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to delete Container Type ${containerType.displayName} : ${error.message}`);
            progressWindow.hide();
            return;
        }
    }
}


export type DeletionCommandProps = ContainerTypeTreeItem | ContainerType;