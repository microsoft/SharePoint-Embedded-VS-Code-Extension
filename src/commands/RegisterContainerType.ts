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
import { GetAccount } from './Accounts/GetAccount';

// Static class that handles the register container type command
export class RegisterContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'deleted';

    // Command handler
    public static async run(commandProps?: RegistrationCommandProps): Promise<void> {
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

        try {
            const containerTypeProvider = account.containerTypeProvider;
            await containerTypeProvider.re
            //await containerType.addTenantRegistration(account.tenantId, (await containerType.owningApp)!, ["full"], ["full"]);
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully registered on tenant ${account.tenantId}`);
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to register Container Type ${containerType.displayName}: ${error}`);
            return;
        }
    }
}

export type RegistrationCommandProps = ContainerTypeTreeItem | ContainerType;

