/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';

// Static class that handles the copy container type id command
export class CopyContainerTypeId extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.copyId';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const containerType: ContainerType = containerTypeViewModel.containerType;
        try {
            const containerTypeId = containerType.containerTypeId;
            await vscode.env.clipboard.writeText(containerTypeId);
            vscode.window.showInformationMessage('Container Type Id copied to clipboard.');
        } catch (error: any) {
            vscode.window.showErrorMessage("Failed to copy Container Type Id to clipboard" + error.message);
            return;
        }
    }
}
