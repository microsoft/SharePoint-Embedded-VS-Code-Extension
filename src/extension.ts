/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ext } from './utils/extensionVariables';
import { AccountTreeViewProvider } from './views/treeview/account/AccountTreeViewProvider';
import { DevelopmentTreeViewProvider } from './views/treeview/development/DevelopmentTreeViewProvider';
import { LocalStorageService, StorageProvider } from './services/StorageProvider';
import { Account } from './models/Account';
import { Commands } from './commands/';

export async function activate(context: vscode.ExtensionContext) {
    ext.context = context;
    ext.outputChannel = vscode.window.createOutputChannel("SharePoint Embedded", { log: true });
    context.subscriptions.push(ext.outputChannel);

    StorageProvider.init(
        new LocalStorageService(context.globalState),
        new LocalStorageService(context.workspaceState),
        context.secrets
    );
    
    vscode.window.registerTreeDataProvider('spe-accounts', AccountTreeViewProvider.getInstance());
    await Account.loginToSavedAccount();
    await Account.get()?.loadFromStorage();

    vscode.window.registerTreeDataProvider('spe-development', DevelopmentTreeViewProvider.getInstance());

    Commands.SignIn.register(context);
    Commands.SignOut.register(context);
    Commands.CreateTrialContainerType.register(context);
    Commands.RegisterContainerType.register(context);
    Commands.CreateGuestApp.register(context);
    Commands.DeleteContainerType.register(context);
    Commands.RefreshContainersList.register(context);
    Commands.CreateContainer.register(context);
    Commands.CloneRepo.register(context);
    Commands.ExportPostmanConfig.register(context);
}
