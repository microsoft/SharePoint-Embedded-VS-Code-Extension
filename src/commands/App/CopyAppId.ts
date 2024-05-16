/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { App } from '../../models/App';
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

        let app: App | undefined;
        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            app = applicationTreeItem.appPerms.app;
        }
        if (applicationTreeItem instanceof OwningAppTreeItem) {
            app = applicationTreeItem.containerType.owningApp!;
        }
        if (!app) {
            vscode.window.showErrorMessage('Could not find app');
            return;
        }

        const appId = app.clientId;
        if (!appId) {
            vscode.window.showErrorMessage('Could not find app id');
            return;
        }
        try {
            await vscode.env.clipboard.writeText(appId);
            vscode.window.showInformationMessage('App Id copied to clipboard.');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to copy App Id to clipboard');
            console.error('Error:', error);
        }
    }
}
