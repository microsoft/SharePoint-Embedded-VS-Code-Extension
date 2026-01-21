/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { App } from '../../models/App';
import { Application } from '../../models/schemas';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';
import { Command } from '../Command';

// Static class that handles the App Id copy command
export class CopyAppId extends Command {
    // Command name
    public static readonly COMMAND = 'App.copyAppId';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        if (!applicationTreeItem) {
            return;
        }

        let appId: string | undefined;

        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            // Guest apps still use old App model
            const app = applicationTreeItem.appPerms.app;
            appId = app?.clientId;
        } else if (applicationTreeItem instanceof OwningAppTreeItem) {
            // Owning apps use new Application schema
            const application = applicationTreeItem.application;
            appId = application?.appId;
        }

        if (!appId) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app id'));
            return;
        }

        try {
            await vscode.env.clipboard.writeText(appId);
            vscode.window.showInformationMessage(vscode.l10n.t('App Id copied to clipboard.'));
        } catch (error) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to copy App Id to clipboard'));
        }
    }
}
