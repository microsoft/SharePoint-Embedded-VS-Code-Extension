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

const GRAPH_EXPLORER_APP_ID = 'de8bc8b5-d9f9-48b1-a8ad-b748da725064';

export class AddGraphExplorerPermissions extends Command {
    public static readonly COMMAND = 'GuestApps.addGraphExplorer';

    public static async run(guestAppsTreeItem?: GuestAppsTreeItem): Promise<void> {
        if (!guestAppsTreeItem) {
            return;
        }

        const containerTypeId = guestAppsTreeItem.containerTypeId;
        if (!containerTypeId) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Adding Graph Explorer permissions...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, GRAPH_EXPLORER_APP_ID, {
                appId: GRAPH_EXPLORER_APP_ID,
                delegatedPermissions: ['full'],
                applicationPermissions: []
            });
            DevelopmentTreeViewProvider.getInstance().refresh(guestAppsTreeItem);
            progressWindow.hide();
            vscode.window.showInformationMessage(vscode.l10n.t('Graph Explorer permissions added successfully'));
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error adding Graph Explorer permissions: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
