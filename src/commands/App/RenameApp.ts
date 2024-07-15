/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Account } from '../../models/Account';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { Command } from '../Command';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { App } from '../../models/App';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { GetAccount } from '../Accounts/GetAccount';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';

// Static class that handles the rename application command
export class RenameApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.rename';

    // Command handler
    public static async run(commandProps?: RenameAppProps): Promise<void> {
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

        const appDisplayName = await vscode.window.showInputBox({
            title: vscode.l10n.t('New display name:'),
            value: app.displayName,
            prompt: vscode.l10n.t('Enter the new display name for the app:'),
            validateInput: (value: string): string | undefined => {
                if (!value) {
                    return vscode.l10n.t('Display name cannot be empty');
                }
                return undefined;
            }
        });

        if (appDisplayName === undefined) {
            return;
        }
        
        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Renaming application...'));
        progressWindow.show();
        try {
            const graphProvider = Account.graphProvider;
            await graphProvider.renameApp(app.objectId, appDisplayName);

            if (commandProps instanceof AppTreeItem) {
                DevelopmentTreeViewProvider.getInstance().refresh(commandProps.parentView ? commandProps.parentView : commandProps);
            } else {
                DevelopmentTreeViewProvider.getInstance().refresh();
            }
            progressWindow.hide();            
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Error renaming application: {0}', error);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}

export type RenameAppProps = AppTreeItem | App;