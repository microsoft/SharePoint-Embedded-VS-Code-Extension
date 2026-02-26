/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { RecycledContainerTreeItem } from '../../views/treeview/development/RecycledContainerTreeItem';

// Static class that handles the delete container command
export class DeleteContainer extends Command {
    // Command name
    public static readonly COMMAND = 'RecycledContainer.delete';

    // Command handler
    public static async run(containerViewModel?: RecycledContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const container = containerViewModel.container;

        const message = vscode.l10n.t("Are you sure you want to permanently delete this container? This is an unrecoverable operation.");
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );

        if (userChoice === vscode.l10n.t('Cancel')) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Deleting container...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.containers.delete(container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.registrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error deleting container: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
