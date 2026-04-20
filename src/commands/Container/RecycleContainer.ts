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

// Static class that handles the recycle container command
export class RecycleContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Container.recycle';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const container = containerViewModel.container;

        const message = vscode.l10n.t("Are you sure you want to recycle this container?");
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );

        if (userChoice === vscode.l10n.t('Cancel')) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Recycling container...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.containers.recycle(container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.registrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to recycle container object: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
