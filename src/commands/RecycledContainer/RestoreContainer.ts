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

// Static class that handles the restore container command
export class RestoreContainer extends Command {
    // Command name
    public static readonly COMMAND = 'RecycledContainer.restore';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const container = containerViewModel.container;

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Restoring container...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.containers.restore(container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.registrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error restoring container: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
