/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { App } from '../../../models/App';
import { GetAccount } from '../../Accounts/GetAccount';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification } from '../../../views/notifications/ProgressWaitNotification';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';

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
        
        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating app certificate...'));
        progressWindow.show();
        try {
            const appProvider = account.appProvider;
            await appProvider.addCert(app);
            progressWindow.hide();
            const message = vscode.l10n.t('Certificate created for app {0}', app.displayName);
            vscode.window.showInformationMessage(message);
            DevelopmentTreeViewProvider.instance.refresh();
            return app;
        } catch (error: any) {
            progressWindow.hide();
            const messsage = vscode.l10n.t('Failed to create cert for app {0}: {1}', app.displayName, error);
            vscode.window.showErrorMessage(messsage);
            return;
        }
    };
}

export type CreateCertProps = AppTreeItem | App;
