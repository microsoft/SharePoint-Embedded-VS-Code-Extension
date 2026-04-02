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

const CONNECTOR_APP_ID = 'e8e1b0bf-140f-4b8b-8e94-fbe8937fad04';

export class AddConnectorPermissions extends Command {
    public static readonly COMMAND = 'GuestApps.addConnector';

    public static async run(guestAppsTreeItem?: GuestAppsTreeItem): Promise<void> {
        if (!guestAppsTreeItem) {
            return;
        }

        const containerTypeId = guestAppsTreeItem.containerTypeId;
        if (!containerTypeId) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Adding Connector permissions...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, CONNECTOR_APP_ID, {
                appId: CONNECTOR_APP_ID,
                delegatedPermissions: ['full'],
                applicationPermissions: []
            });
            DevelopmentTreeViewProvider.getInstance().refresh(guestAppsTreeItem);
            progressWindow.hide();
            vscode.window.showInformationMessage(vscode.l10n.t('Connector permissions added successfully'));
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error adding Connector permissions: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
