/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';

// Static class that handles the owning tenant id command
export class CopyOwningTenantId extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.copyOwningTenantId';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const containerType: ContainerType = containerTypeViewModel.containerType;
        try {
            const owningTenantId = containerType.owningTenantId;
            await vscode.env.clipboard.writeText(owningTenantId);
            vscode.window.showInformationMessage('Owning tenant Id copied to clipboard.');
        } catch (error: any) {
            vscode.window.showErrorMessage("Failed to copy Owning tenant Id to clipboard" + error.message);
            return;
        }
    }
}
