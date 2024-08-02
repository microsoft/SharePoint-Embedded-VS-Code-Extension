/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { App } from '../../../models/App';
import { GetAccount } from '../../Accounts/GetAccount';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';

// Static class that copies an app secret to the clipboard
export class CopySecret extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.copySecret';

    // Command handler
    public static async run(commandProps?: CopySecretProps): Promise<void> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let app: App | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps instanceof GuestApplicationTreeItem) {
                app = commandProps.appPerms.app;
            }
            if (commandProps instanceof OwningAppTreeItem) {
                app = commandProps.containerType.owningApp!;
            }
        } else {
            app = commandProps;
        }
        if (!app) {
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
