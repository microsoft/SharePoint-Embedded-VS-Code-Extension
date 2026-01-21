/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { App } from '../../../models/App';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';
import { AuthenticationState } from '../../../services/AuthenticationState';
import { Account } from '../../../models/Account';

// Static class that copies an app secret to the clipboard
export class CopySecret extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.copySecret';

    // Command handler
    public static async run(commandProps?: CopySecretProps): Promise<void> {
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to create app secrets.');
        }

        let app: App | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps instanceof GuestApplicationTreeItem) {
                app = commandProps.appPerms.app;
            } else if (commandProps instanceof OwningAppTreeItem) {
                // For owning apps, load the old App model for credential operations
                const account = Account.get();
                if (account?.appProvider) {
                    app = await account.appProvider.get(commandProps.containerType.owningAppId);
                }
            }
        } else {
            app = commandProps;
        }
        if (!app) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app'));
            return;
        }

        const secrets = await app.getSecrets();
        if (!secrets.clientSecret) {
            return;
        }

        await vscode.env.clipboard.writeText(secrets.clientSecret);
        const message = vscode.l10n.t('App {0} secret copied to clipboard', app.displayName);
        vscode.window.showInformationMessage(message);
    };
}

export type CopySecretProps = AppTreeItem | App;
