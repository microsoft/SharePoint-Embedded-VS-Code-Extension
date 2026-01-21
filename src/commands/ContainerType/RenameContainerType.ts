/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { ContainerType } from '../../models/schemas';
import { GetAccount } from '../Accounts/GetAccount';

// Static class that handles the rename container type command
// TODO: This command needs to be updated to use the new ContainerTypeService when SharePoint Admin API integration is complete
export class RenameContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.rename';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        const containerType: ContainerType = containerTypeViewModel.containerType;

        // TODO: Implement using new ContainerTypeService with SharePoint Admin API
        // This requires the ContainerTypeService.update() method
        vscode.window.showWarningMessage(
            vscode.l10n.t('Rename container type feature requires SharePoint Admin API integration. This will be available in a future update.')
        );
    }
}
