/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { ChooseAppPermissions, PermissionInput } from './ChooseAppPermissions';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ContainerTypeAppPermission } from '../../models/schemas';

// Static class that handles the edit guest app permissions command
export class EditGuestAppPermissions extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApp.editPermissions';

    // Command handler
    public static async run(guestAppTreeItem?: GuestApplicationTreeItem): Promise<void> {
        if (!guestAppTreeItem) {
            return;
        }

        const containerTypeId = guestAppTreeItem.containerTypeId;
        const appId = guestAppTreeItem.grant.appId;

        if (!containerTypeId || !appId) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        // Fetch current permissions from Graph API
        let existingPerms: PermissionInput | undefined;
        try {
            const grant = await graphProvider.appPermissionGrants.get(containerTypeId, appId);
            console.log(`[EditGuestAppPermissions] Fetched grant:`, JSON.stringify(grant));
            if (grant) {
                existingPerms = {
                    delegated: grant.delegatedPermissions,
                    appOnly: grant.applicationPermissions
                };
                console.log(`[EditGuestAppPermissions] Existing perms:`, JSON.stringify(existingPerms));
            }
        } catch (error: any) {
            console.error('[EditGuestAppPermissions] Error fetching current permissions:', error);
        }

        const selectedPerms = await ChooseAppPermissions.run(existingPerms);
        if (!selectedPerms) {
            return;
        }

        console.log(`[EditGuestAppPermissions] Selected delegated:`, selectedPerms.delegatedPerms);
        console.log(`[EditGuestAppPermissions] Selected application:`, selectedPerms.applicationPerms);

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Updating app registration permissions...'));
        progressWindow.show();
        try {
            await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, appId, {
                appId,
                delegatedPermissions: selectedPerms.delegatedPerms as ContainerTypeAppPermission[],
                applicationPermissions: selectedPerms.applicationPerms as ContainerTypeAppPermission[]
            });
            DevelopmentTreeViewProvider.getInstance().refresh(guestAppTreeItem.parentView);
            progressWindow.hide();
            vscode.window.showInformationMessage(vscode.l10n.t('App registration permissions updated successfully'));
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error updating app registration permissions: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}
