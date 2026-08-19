/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { hasExtensionAppPermissions, grantExtensionAppPermissions } from '../../utils/ExtensionAppPermissions';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { openStorageExplorerWhenReady } from './StorageExplorerHandoff';

export class GrantExtensionAppPermissions extends Command {
    public static readonly COMMAND = 'ContainerType.grantExtensionAppPermissions';

    public static async run(commandProps?: ContainerTypeTreeItem | string): Promise<boolean> {
        // Extract container type ID from command props
        let containerTypeId: string | undefined;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerTypeId = commandProps.containerType.id;
        } else if (typeof commandProps === 'string') {
            containerTypeId = commandProps;
        }

        if (!containerTypeId) {
            vscode.window.showErrorMessage(vscode.l10n.t('No container type provided.'));
            return false;
        }

        // Check if permissions are already granted
        const checkProgress = new ProgressWaitNotification(
            vscode.l10n.t('Checking extension app permissions...')
        );
        checkProgress.show();

        const alreadyGranted = await hasExtensionAppPermissions(containerTypeId);
        checkProgress.hide();

        if (alreadyGranted) {
            vscode.window.showInformationMessage(
                vscode.l10n.t('Extension app permissions are already granted on this container type.')
            );
            return true;
        }

        // Grant permissions
        const grantProgress = new ProgressWaitNotification(
            vscode.l10n.t('Granting extension app permissions...')
        );
        grantProgress.show();

        try {
            await grantExtensionAppPermissions(containerTypeId);
            grantProgress.hide();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Extension app permissions granted successfully.')
            );
            // Refreshes the tree and, if this grant was the last missing step, takes the
            // user straight into Storage Explorer.
            if (commandProps instanceof ContainerTypeTreeItem) {
                await openStorageExplorerWhenReady(commandProps.containerType, commandProps.registration);
            } else {
                DevelopmentTreeViewProvider.getInstance().refresh();
            }
            return true;
        } catch (error: any) {
            grantProgress.hide();
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to grant extension app permissions: {0}', error?.message || String(error))
            );
            return false;
        }
    }
}
