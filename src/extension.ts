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

    vscode.window.registerTreeDataProvider(AccountTreeViewProvider.viewId, AccountTreeViewProvider.getInstance());
    vscode.window.registerTreeDataProvider(DevelopmentTreeViewProvider.viewId, DevelopmentTreeViewProvider.getInstance());

    Account.subscribeLoginListener({
        onLogin: () => {
            DevelopmentTreeViewProvider.getInstance().refresh();
        },
        onLogout: () => {
            DevelopmentTreeViewProvider.getInstance().refresh();
        }
    });

    Account.hasSavedAccount().then(async hasSavedAccount => {
        if (hasSavedAccount) {
            Account.loginToSavedAccount();
        }
    });

    console.log('new build');

    Commands.SignIn.register(context);
    Commands.SignOut.register(context);
    Commands.CreateTrialContainerType.register(context);
    Commands.CreatePaidContainerType.register(context);
    //Commands.RegisterContainerType.register(context);
    Commands.CreateGuestApp.register(context);
    Commands.DeleteContainerType.register(context);
    Commands.RefreshContainersList.register(context);
    Commands.CloneRepo.register(context);
    Commands.ExportPostmanConfig.register(context);
    Commands.RenameApplication.register(context);
    Commands.CancelSignIn.register(context);
    Commands.Refresh.register(context);

    // Container Type Context Menu Commands
    Commands.CopyContainerTypeId.register(context);
    Commands.CopyOwningTenantId.register(context);
    Commands.CopySubscriptionId.register(context);
    Commands.ViewContainerTypeProperties.register(context);
    Commands.RegisterOnLocalTenant.register(context);
    Commands.RenameContainerType.register(context);

    // App Context Menu Commands
    Commands.CopyPostmanConfig.register(context);
    Commands.CreateAppCert.register(context);
    Commands.ForgetAppCert.register(context);
    Commands.CreateSecret.register(context);
    Commands.CopySecret.register(context);
    Commands.GetLocalAdminConsent.register(context);
    Commands.ForgetAppSecret.register(context);

    // App Commands
    Commands.GetOrCreateApp.register(context);
    Commands.ViewInAzure.register(context);

    // Container Commands
    Commands.CreateContainer.register(context);
    Commands.RenameContainer.register(context);
    Commands.EditContainerDescription.register(context);
    Commands.RecycleContainer.register(context);
    Commands.CopyContainerId.register(context);
    Commands.ViewContainerProperties.register(context);
    
    // Recycled Container Commands
    Commands.CopyRecycledContainerId.register(context);
    Commands.DeleteContainer.register(context);
}
