/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType as NewContainerType } from '../../models/schemas';
import { ContainerType as OldContainerType } from '../../models/ContainerType';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { GetAccount } from '../Accounts/GetAccount';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';

// Static class that handles the register container type command
// TODO: This command needs to be updated to use the new ContainerTypeService when SharePoint Admin API integration is complete
export class RegisterOnLocalTenant extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.registerOnLocalTenant';

    // Command handler
    public static async run(commandProps?: RegistrationCommandProps, newApplicationPermissions?: ApplicationPermissions): Promise<void> {
        if (!commandProps) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        // Accept both old and new container type models for now
        // TODO: Remove old model support when all commands are migrated
        if (commandProps instanceof ContainerTypeTreeItem) {
            // Container type from tree item is new schema
        } else {
            // Direct container type parameter can be old or new model
        }

        // TODO: Implement using new ContainerTypeService with SharePoint Admin API
        // This requires the ContainerTypeService.register() method and integration with ApplicationService
        vscode.window.showWarningMessage(
            vscode.l10n.t('Register container type feature requires SharePoint Admin API integration. This will be available in a future update.')
        );
    }
}

// Temporarily accept both old and new ContainerType models until migration is complete
export type RegistrationCommandProps = ContainerTypeTreeItem | NewContainerType | OldContainerType;
