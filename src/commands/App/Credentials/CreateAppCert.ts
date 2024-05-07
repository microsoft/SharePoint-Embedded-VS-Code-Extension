/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { Account } from '../../../models/Account';
import { BillingClassification, ContainerType } from '../../../models/ContainerType';
import { ContainerTypeCreationFlow, ContainerTypeCreationFlowState } from '../../../views/qp/UxFlows';
import { ProgressNotification } from '../../../views/notifications/ProgressNotification';
import { App } from '../../../models/App';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { GetAccount } from '../../Accounts/GetAccount';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';

// Static class that creates a cert on an app
export class CreateAppCert extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.createCert';

    // Command handler
    public static async run(commandProps?: CreateCertProps): Promise<App | undefined> {
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

        try {
            const appProvider = account.appProvider;
            await appProvider.addCert(app);
            return app;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create cert for app ${app.displayName}: ${error}`);
            return;
        }


    };
}

export type CreateCertProps = AppTreeItem | App;
