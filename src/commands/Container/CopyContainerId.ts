/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';
import { RecycledContainerTreeItem } from '../../views/treeview/development/RecycledContainerTreeItem';

// Static class that handles the copy container type id command
export class CopyContainerId extends Command {
    // Command name
    public static readonly COMMAND = 'Container.copyId';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem | RecycledContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const id: string = containerViewModel.container.id;
        try {
            await vscode.env.clipboard.writeText(id);
            vscode.window.showInformationMessage('Container Id copied to clipboard.');
        } catch (error: any) {
            vscode.window.showErrorMessage("Failed to copy Container Id to clipboard" + error.message);
            return;
        }
    }
}
