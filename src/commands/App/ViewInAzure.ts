
//App.viewInAzure

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

// Static class that creates a cert on an app
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
            if (commandProps.app && commandProps.app instanceof App) {
                app = commandProps.app;
            }
        } else {
            app = commandProps;
        }
        if (!app) {
            return;
        }

        const azureLink = AzurePortalUrlProvider.getAppRegistrationUrl(app.clientId);
        vscode.env.openExternal(vscode.Uri.parse(azureLink));
    };
}

export type ViewInAzureProps = AppTreeItem | App;
