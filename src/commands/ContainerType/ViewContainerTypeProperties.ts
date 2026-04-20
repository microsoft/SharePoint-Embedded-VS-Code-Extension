/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { GraphProvider } from '../../services/Graph/GraphProvider';

// Static class that handles the view properties command
export class ViewContainerTypeProperties extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.viewProperties';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        try {
            // Fetch latest container type data from API (with no-cache to get fresh data)
            const graphProvider = GraphProvider.getInstance();
            const containerType = await graphProvider.containerTypes.get(
                containerTypeViewModel.containerType.id,
                { noCache: true }
            );

            if (!containerType) {
                vscode.window.showErrorMessage(vscode.l10n.t('Could not fetch container type properties'));
                return;
            }

            const containerTypeProperties = JSON.stringify(containerType, null, 4);
            const provider = new (class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    return containerTypeProperties;
                }
            })();

            const registration = vscode.workspace.registerTextDocumentContentProvider('virtual', provider);
            // Add timestamp to URI to prevent VS Code from caching the document content
            let uri = vscode.Uri.parse(`virtual://${containerType.id}/${containerType.name}.json?t=${Date.now()}`, true);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true });
            await vscode.languages.setTextDocumentLanguage(doc, 'json');
            registration.dispose();
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to open container type properties: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
