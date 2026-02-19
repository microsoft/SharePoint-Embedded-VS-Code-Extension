/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';

// Static class that handles the rename container command
export class RenameContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Container.rename';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const container = containerViewModel.container;
        const containerDisplayName = await vscode.window.showInputBox({
            title: vscode.l10n.t('New display name:'),
            value: container.displayName,
            prompt: vscode.l10n.t('Enter the new display name for the container:'),
            validateInput: (value: string): string | undefined => {
                const maxLength = 50;
                const alphanumericRegex = /^[a-zA-Z0-9\s-_]+$/;
                if (!value) {
                    return vscode.l10n.t('Display name cannot be empty');
                }
                if (value.length > maxLength) {
                    return vscode.l10n.t(`Display name must be no more than {0} characters long`, maxLength);
                }
                if (!alphanumericRegex.test(value)) {
                    return vscode.l10n.t('Display name must only contain alphanumeric characters');
                }
                return undefined;
            }
        });

        if (containerDisplayName === undefined) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Renaming container...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.containers.update(container.id, { displayName: containerDisplayName });
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to rename container object: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
