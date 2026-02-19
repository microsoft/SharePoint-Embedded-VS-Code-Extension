/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { GuestAppsTreeItem } from '../../views/treeview/development/GuestAppsTreeItem';
import { ChooseAppPermissions } from './ChooseAppPermissions';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { Application, ContainerTypeAppPermission } from '../../models/schemas';

// Static class that handles the create guest app command
export class GetorCreateGuestApp extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApps.add';

    // Command handler
    public static async run(guestAppsTreeItem?: GuestAppsTreeItem): Promise<Application | undefined> {
        if (!guestAppsTreeItem) {
            return;
        }

        const containerTypeId = guestAppsTreeItem.containerTypeId;
        if (!containerTypeId) {
            return;
        }

        const app = await GetOrCreateApp.run(false);
        if (!app) {
            return;
        }

        const selectedPerms = await ChooseAppPermissions.run();
        if (!selectedPerms) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Adding guest app permissions...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, app.appId!, {
                appId: app.appId!,
                delegatedPermissions: selectedPerms.delegatedPerms as ContainerTypeAppPermission[],
                applicationPermissions: selectedPerms.applicationPerms as ContainerTypeAppPermission[]
            });
            DevelopmentTreeViewProvider.getInstance().refresh(guestAppsTreeItem);
            progressWindow.hide();
            vscode.window.showInformationMessage(vscode.l10n.t('Guest app added successfully'));
            return app;
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error adding guest app: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}
