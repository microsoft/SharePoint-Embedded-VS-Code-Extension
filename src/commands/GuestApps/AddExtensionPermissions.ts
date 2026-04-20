/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { GuestAppsTreeItem } from '../../views/treeview/development/GuestAppsTreeItem';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { clientId } from '../../client';

export class AddExtensionPermissions extends Command {
    public static readonly COMMAND = 'GuestApps.addExtension';

    public static async run(guestAppsTreeItem?: GuestAppsTreeItem): Promise<void> {
        if (!guestAppsTreeItem) {
            return;
        }

        const containerTypeId = guestAppsTreeItem.containerTypeId;
        if (!containerTypeId) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Adding extension permissions...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, clientId, {
                appId: clientId,
                delegatedPermissions: ['full'],
                applicationPermissions: []
            });
            DevelopmentTreeViewProvider.getInstance().refresh(guestAppsTreeItem);
            progressWindow.hide();
            vscode.window.showInformationMessage(vscode.l10n.t('Extension permissions added successfully'));
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error adding extension permissions: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
