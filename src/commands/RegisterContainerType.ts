/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { ContainerType } from '../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';
import { ContainerTypeTreeItem } from '../views/treeview/development/ContainerTypeTreeItem';

// Static class that handles the register container type command
export class RegisterContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'registerContainerType';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;

        if (!containerType) {
            vscode.window.showErrorMessage(`Container Type registration failed. No container types found.`);
            return;
        }

        try {
            await containerType.addTenantRegistration(account.tenantId, (await containerType.owningApp)!, ["full"], ["full"]);
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully registered on tenant ${account.tenantId}`);
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to register Container Type ${containerType.displayName}: ${error}`);
            return;
        }
    }
}
