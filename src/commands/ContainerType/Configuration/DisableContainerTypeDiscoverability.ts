/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../Command';
import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../../views/treeview/development/ContainerTypeTreeItem';
import { ContainerType } from '../../../models/schemas';
import { GetAccount } from '../../Accounts/GetAccount';

// Static class that handles the disable discoverability command
// TODO: This command needs to be updated to use the new ContainerTypeService when SharePoint Admin API integration is complete
export class DisableContainerTypeDiscoverability extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.disableDiscoverability';

    // Command handler
    public static async run(commandProps?: DisableDiscoverabilityCommandProps): Promise<void> {
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

        // TODO: Implement using new ContainerTypeService with Graph API
        // This requires the ContainerTypeService.updateSettings() method
        vscode.window.showWarningMessage(
            vscode.l10n.t('Disable discoverability feature requires SharePoint Admin API integration. This will be available in a future update.')
        );
    }
}

export type DisableDiscoverabilityCommandProps = ContainerTypeTreeItem | ContainerType;
