/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './Command';
import * as vscode from 'vscode';
import { ContainerType } from '../models/ContainerType';
import { ContainersTreeItem } from '../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the create container command
export class CreateContainer extends Command {
    // Command name
    public static readonly COMMAND = 'createContainer';

    // Command handler
    public static async run(containersViewModel?: ContainersTreeItem): Promise<void> {
        if (!containersViewModel) {
            return;
        }
        const containerType: ContainerType = containersViewModel.containerType;
        const containerDisplayName = await vscode.window.showInputBox({
            prompt: 'Display name:'
        });

        if (!containerDisplayName) {
            vscode.window.showErrorMessage('No container display name provided');
            return;
        }

        let containerDescription = await vscode.window.showInputBox({
            prompt: 'Optional description:'
        });

        if (!containerDescription) {
            containerDescription = '';
        }

        try {
            await containerType.createContainer(containerDisplayName, containerDescription);
            containersViewModel.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create container object: " + error.message);
            return;
        }
    }
}
