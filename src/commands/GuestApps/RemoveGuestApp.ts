/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the remove guest app command
export class RemoveGuestApp extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApp.remove';

    // Command handler
    public static async run(guestAppTreeItem?: GuestApplicationTreeItem): Promise<void> {
        if (!guestAppTreeItem) {
            return;
        }

        const containerTypeId = guestAppTreeItem.containerTypeId;
        const appId = guestAppTreeItem.grant.appId;
        const appName = guestAppTreeItem.application?.displayName || appId;

        if (!containerTypeId || !appId) {
            return;
        }

        const message = vscode.l10n.t('Are you sure you want to remove app registration "{0}"?', appName);
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );

        if (userChoice !== vscode.l10n.t('OK')) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Removing app registration...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.appPermissionGrants.delete(containerTypeId, appId);
            DevelopmentTreeViewProvider.getInstance().refresh(guestAppTreeItem.parentView);
            progressWindow.hide();
            vscode.window.showInformationMessage(vscode.l10n.t('App registration removed successfully'));
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error removing app registration: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
