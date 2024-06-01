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
            title: 'New display name:',
            value: app.displayName,
            prompt: 'Enter the new display name for the app:',
            validateInput: (value: string): string | undefined => {
                if (!value) {
                    return 'Display name cannot be empty';
                }
                return undefined;
            }
        });

        if (appDisplayName === undefined) {
            return;
        }
        
        const progressWindow = new ProgressWaitNotification('Renaming application');
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
        } catch (error) {
            progressWindow.hide();
            vscode.window.showErrorMessage(`Error renaming application: ${error}`);
            return;
        }
        
        // const ctRefreshTimer = new Timer(60 * 1000);
        // const refreshCt = async (): Promise<void> => {
        //     do {
        //         const containerTypes = await containerTypeProvider.list();
        //         if (containerTypes.find(ct => 
        //             ct.containerTypeId === containerType.containerTypeId &&
        //             ct.displayName === containerTypeDisplayName)
        //         ) {
        //             setTimeout(() => DevelopmentTreeViewProvider.instance.refresh(), 3000);
        //             break;
        //         }
        //         // sleep for 2 seconds
        //         await new Promise(r => setTimeout(r, 2000));
        //     } while (!ctRefreshTimer.finished);
            
        //     progressWindow.hide();
        // };
        // refreshCt();
    }
}

export type RenameAppProps = AppTreeItem | App;