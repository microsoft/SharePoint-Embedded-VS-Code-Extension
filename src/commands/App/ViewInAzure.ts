/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { App } from '../../models/App';
import { GetAccount } from '../Accounts/GetAccount';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { AzurePortalUrlProvider } from '../../utils/AzurePortalUrl';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';

// Static class that views app in Azure
export class ViewInAzure extends Command {
    // Command name
    public static readonly COMMAND = 'App.viewInAzure';

    // Command handler
    public static async run(commandProps?: ViewInAzureProps): Promise<void> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let app: App | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps instanceof GuestApplicationTreeItem) {
                app = commandProps.appPerms.app;
            } else if (commandProps instanceof OwningAppTreeItem) {
                // For owning apps, load the old App model
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

        const azureLink = AzurePortalUrlProvider.getAppRegistrationUrl(app.clientId);
        vscode.env.openExternal(vscode.Uri.parse(azureLink));
    };
}

export type ViewInAzureProps = AppTreeItem | App;
