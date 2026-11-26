/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ContainerTypeOwnerPermission } from '../../models/schemas';
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
            const containerTypes = GraphProvider.getInstance().containerTypes;
            const containerType = await containerTypes.get(
                containerTypeViewModel.containerType.id,
                { noCache: true }
            );

            if (!containerType) {
                vscode.window.showErrorMessage(vscode.l10n.t('Could not fetch container type properties'));
                return;
            }

            let permissions: ContainerTypeOwnerPermission[] | undefined;
            try {
                permissions = await containerTypes.listOwnerPermissions(containerType.id);
            } catch (error) {
                // The caller can still view v1.0 properties if the beta read is denied or fails.
                void vscode.window.showWarningMessage(vscode.l10n.t(
                    'Could not load owner permissions for container type "{0}": {1}',
                    containerType.name,
                    error instanceof Error ? error.message : String(error)
                ));
            }

            const containerTypeProperties = JSON.stringify({ ...containerType, permissions }, null, 4);
            const provider = new (class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(): string {
                    return containerTypeProperties;
                }
            })();

            const registration = vscode.workspace.registerTextDocumentContentProvider('virtual', provider);
            try {
                // Add timestamp to URI to prevent VS Code from caching the document content
                const uri = vscode.Uri.parse(`virtual://${containerType.id}/${containerType.name}.json?t=${Date.now()}`, true);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: true });
                await vscode.languages.setTextDocumentLanguage(doc, 'json');
            } finally {
                registration.dispose();
            }
        } catch (error) {
            const message = vscode.l10n.t('Failed to open container type properties: {0}', error instanceof Error ? error.message : String(error));
            vscode.window.showErrorMessage(message);
        }
    }
}
