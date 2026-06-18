/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { pickContainerTypeOwners } from '../ContainerTypes/ui/pickContainerTypeOwners';

const MAX_OWNERS = 3;

export class AddContainerTypeOwners extends Command {
    public static readonly COMMAND = 'ContainerType.addOwners';

    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        const ct = containerTypeViewModel.containerType;
        const graphProvider = GraphProvider.getInstance();

        let currentCount = 0;
        try {
            const existing = await graphProvider.containerTypes.listPermissions(ct.id);
            currentCount = existing.length;
        } catch (error: any) {
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to load current owners: {0}', error?.message ?? String(error))
            );
            return;
        }

        const remaining = MAX_OWNERS - currentCount;
        if (remaining <= 0) {
            vscode.window.showInformationMessage(
                vscode.l10n.t('Container type "{0}" already has the maximum of {1} owners. Remove an owner before adding another.', ct.name, MAX_OWNERS)
            );
            return;
        }

        const picked = await pickContainerTypeOwners({
            max: remaining,
            title: vscode.l10n.t('Pick container type owners for {0}', ct.name)
        });
        if (!picked || picked.length === 0) {
            return;
        }

        const failed: string[] = [];
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Adding container type owners…')
            },
            async () => {
                for (const owner of picked) {
                    try {
                        await graphProvider.containerTypes.addOwner(ct.id, owner.id);
                    } catch (error: any) {
                        console.warn(`[AddContainerTypeOwners] Failed to add owner ${owner.id}:`, error);
                        failed.push(owner.displayName ?? owner.id);
                    }
                }
            }
        );

        if (failed.length === picked.length) {
            vscode.window.showErrorMessage(
                vscode.l10n.t('Could not add any owners to container type "{0}".', ct.name)
            );
            return;
        }

        if (failed.length > 0) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Could not add {0} as owner(s) on container type "{1}".', failed.join(', '), ct.name)
            );
        } else {
            vscode.window.showInformationMessage(
                vscode.l10n.t('Added {0} owner(s) to container type "{1}".', picked.length - failed.length, ct.name)
            );
        }

        DevelopmentTreeViewProvider.getInstance().refresh();
    }
}
