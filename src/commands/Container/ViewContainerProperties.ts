/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';
import { Container } from '../../models/Container';

// Static class that handles the view properties command
export class ViewContainerProperties extends Command {
    // Command name
    public static readonly COMMAND = 'Container.viewProperties';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const container: Container = containerViewModel.container;
        try {
            const containerProperties = JSON.stringify(container.getProperties(), null, 4);
            const provider = new (class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    return containerProperties;
                }
            })();

            const registration = vscode.workspace.registerTextDocumentContentProvider('virtual', provider);
            let uri = vscode.Uri.parse(`virtual://${container.id}/${container.displayName}.json`, true);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true});
            await vscode.languages.setTextDocumentLanguage(doc, 'json');
            registration.dispose();
        } catch (error: any) {
            vscode.window.showErrorMessage("Failed to open container properties: " + error.message);
        }
    }
}
