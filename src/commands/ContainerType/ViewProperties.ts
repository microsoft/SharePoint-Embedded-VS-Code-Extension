/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';

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
            const provider = new (class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    return containerTypeProperties;
                }
            })();

            const registration = vscode.workspace.registerTextDocumentContentProvider('virtual', provider);
            let uri = vscode.Uri.parse('virtual://containerTypeProperties.json');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true});
            await vscode.languages.setTextDocumentLanguage(doc, 'json');
            registration.dispose();
        } catch (error: any) {
            vscode.window.showErrorMessage("Failed to open container type properties: " + error.message);
        }
    }
}
