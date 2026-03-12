/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ext } from './utils/extensionVariables';
import { AccountTreeViewProvider } from './views/treeview/account/AccountTreeViewProvider';
import { DevelopmentTreeViewProvider } from './views/treeview/development/DevelopmentTreeViewProvider';
import { LocalStorageService, StorageProvider } from './services/StorageProvider';
import { TelemetryProvider } from './services/TelemetryProvider';
import { Commands } from './commands/';
import { AuthenticationState } from './services/AuthenticationState';
import { GraphAuthProvider } from './services/Auth';
import { SpeUriHandler } from './services/UriHandler';

export async function activate(context: vscode.ExtensionContext) {
    ext.context = context;
    ext.outputChannel = vscode.window.createOutputChannel("SharePoint Embedded", { log: true });
    context.subscriptions.push(ext.outputChannel);
    context.subscriptions.push(TelemetryProvider.instance);

    StorageProvider.init(
        new LocalStorageService(context.globalState),
        new LocalStorageService(context.workspaceState),
        context.secrets
    );
    await StorageProvider.purgeOldCache();

    // Push tree view registrations to subscriptions so they are disposed
    // when the extension deactivates (prevents duplicate nodes on VSIX reinstall).
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(AccountTreeViewProvider.viewId, AccountTreeViewProvider.getInstance())
    );

    // Use createTreeView for the development view so we can call reveal() on it
    const devTreeView = vscode.window.createTreeView(DevelopmentTreeViewProvider.viewId, {
        treeDataProvider: DevelopmentTreeViewProvider.getInstance()
    });
    DevelopmentTreeViewProvider.getInstance().setTreeView(devTreeView);
    context.subscriptions.push(devTreeView);

    // Register URI handler for deep links
    context.subscriptions.push(vscode.window.registerUriHandler(new SpeUriHandler()));

    // Subscribe to authentication state changes for development tree view
    AuthenticationState.subscribe({
        onSignIn: () => {
            DevelopmentTreeViewProvider.getInstance().refresh();
        },
        onSignOut: () => {
            DevelopmentTreeViewProvider.getInstance().refresh();
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('spe.showContextMenu', () => {
            // Inline ellipsis button: focuses the tree item so the user can
            // right-click or press Shift+F10 to open the context menu.
        })
    );

    // Register ALL commands before initialize() so they work even if
    // initialize() hangs due to stale auth sessions from the old extension.
    Commands.SignIn.register(context);
    Commands.SignOut.register(context);
    Commands.SwitchAccount.register(context);
    Commands.CreateTrialContainerType.register(context);
    Commands.CreatePaidContainerType.register(context);
    Commands.DeleteContainerType.register(context);
    Commands.ExportPostmanConfig.register(context);
    Commands.CancelSignIn.register(context);
    Commands.Refresh.register(context);

    // Container Type Context Menu Commands
    Commands.CopyContainerTypeId.register(context);
    Commands.CopyOwningTenantId.register(context);
    Commands.CopySubscriptionId.register(context);
    Commands.ViewContainerTypeProperties.register(context);
    Commands.RegisterOnLocalTenant.register(context);
    Commands.RenameContainerType.register(context);
    Commands.LearnMoreDiscoverability.register(context);
    Commands.EnableContainerTypeDiscoverability.register(context);
    Commands.DisableContainerTypeDiscoverability.register(context);

    // App Context Menu Commands
    Commands.CopyPostmanConfig.register(context);
    Commands.GetLocalAdminConsent.register(context);
    Commands.OpenPostmanDocumentation.register(context);

    // App Commands
    Commands.GetOrCreateApp.register(context);
    Commands.GetOrCreateGuestApp.register(context);
    Commands.ViewInAzure.register(context);
    Commands.RenameApp.register(context);
    Commands.CloneDotNetSampleApp.register(context);
    Commands.CloneReactSampleApp.register(context);
    Commands.CopyAppId.register(context);
    Commands.EditGuestAppPermissions.register(context);
    Commands.RemoveGuestApp.register(context);

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
    Commands.RestoreContainer.register(context);

    // Initialize authentication state AFTER commands are registered.
    // Uses a timeout to prevent hanging if stale sessions from the old
    // extension cause vscode.authentication.getSession() to block.
    try {
        await Promise.race([
            AuthenticationState.initialize(),
            new Promise<void>((_, reject) =>
                setTimeout(() => reject(new Error('Auth initialization timed out')), 15_000)
            )
        ]);
    } catch (error) {
        console.error('[extension] Auth initialization failed or timed out:', error);
        // Ensure the welcome view shows so the user can sign in manually
        vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
        vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
    }

    // Sync: when user signs out via VS Code's account picker, sign out of extension too.
    // Guarded to prevent re-entrant calls during session migration (old→new extension).
    let isProcessingSessionChange = false;
    context.subscriptions.push(
        vscode.authentication.onDidChangeSessions(async (e) => {
            if (e.provider.id === 'microsoft') {
                if (isProcessingSessionChange) { return; }
                isProcessingSessionChange = true;
                try {
                    const graphAuth = GraphAuthProvider.getInstance();
                    if (graphAuth.getCurrentSession()) {
                        try {
                            await graphAuth.getToken([], false);
                        } catch {
                            // Session no longer valid — trigger extension sign-out
                            await AuthenticationState.signOut();
                            DevelopmentTreeViewProvider.getInstance().refresh();
                        }
                    }
                } finally {
                    isProcessingSessionChange = false;
                }
            }
        })
    );
}


// Cleanup when extension is deactivated
export function deactivate() {
    AccountTreeViewProvider.resetInstance();
    DevelopmentTreeViewProvider.resetInstance();
}
