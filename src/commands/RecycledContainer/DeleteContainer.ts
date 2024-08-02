/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { App } from '../../models/App';
import { GraphProvider } from '../../services/GraphProvider';
import { Container } from '../../models/Container';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { RecycledContainerTreeItem } from '../../views/treeview/development/RecycledContainerTreeItem';

// Static class that handles the recycle container command
export class DeleteContainer extends Command {
    // Command name
    public static readonly COMMAND = 'RecycledContainer.delete';

    // Command handler
    public static async run(containerViewModel?: RecycledContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;

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
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProvider(authProvider);
            await graphProvider.deleteContainer(container.id);
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error deleting container: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}
