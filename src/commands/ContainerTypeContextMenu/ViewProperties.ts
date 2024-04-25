/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';
import * as fs from 'fs';
import * as tmp from 'tmp';

// Static class that handles the view properties command
export class ViewProperties extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.viewProperties';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const containerType: ContainerType = containerTypeViewModel.containerType;
        try {
            const containerTypeProperties = JSON.stringify(containerType.getProperties(), null, 4);
            tmp.file({ prefix: 'containertype-properties', postfix: '.json' }, (err, tempFilePath, fd, cleanupCallback) => {
                if (err) {
                    vscode.window.showErrorMessage("Failed to create temporary file: " + err.message);
                    return;
                }
                fs.writeFileSync(tempFilePath, containerTypeProperties);
                vscode.workspace.openTextDocument(tempFilePath).then(async doc => {
                    await vscode.window.showTextDocument(doc, { preview: true });
                    cleanupCallback();
                });
            });
        } catch (error: any) {
            vscode.window.showErrorMessage("Failed to open container type properties " + error.message);
            return;
        }
    }
}
