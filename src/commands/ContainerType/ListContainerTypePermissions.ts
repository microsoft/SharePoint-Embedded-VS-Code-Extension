/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { GraphProvider } from '../../services/Graph/GraphProvider';

export class ListContainerTypePermissions extends Command {
    public static readonly COMMAND = 'ContainerType.listPermissions';

    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        const ct = containerTypeViewModel.containerType;
        try {
            const permissions = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: vscode.l10n.t('Loading permissions for {0}…', ct.name)
                },
                () => GraphProvider.getInstance().containerTypes.listPermissions(ct.id)
            );

            const content = JSON.stringify(permissions, null, 4);
            const provider = new (class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(): string {
                    return content;
                }
            })();
            const registration = vscode.workspace.registerTextDocumentContentProvider('virtual', provider);
            const uri = vscode.Uri.parse(
                `virtual://${ct.id}/${ct.name}-permissions.json?t=${Date.now()}`,
                true
            );
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true });
            await vscode.languages.setTextDocumentLanguage(doc, 'json');
            registration.dispose();
        } catch (error: any) {
            const message = vscode.l10n.t(
                'Failed to list permissions for container type: {0}',
                error?.message ?? String(error)
            );
            vscode.window.showErrorMessage(message);
        }
    }
}
