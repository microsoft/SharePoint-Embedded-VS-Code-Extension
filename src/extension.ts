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
    // Reset view state so the welcome/sign-in view shows first.
    // initialize() will flip these if there's a valid session.
    await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
    await vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
    // Compat: versions <= 1.0.2 used spe:isAdmin to gate the dev view.
    // After VSIX upgrade VS Code restarts the extension host but keeps
    // the old package.json cached, so the stale when-clause "spe:isAdmin"
    // is still evaluated. Clearing it here hides the dev view until sign-in.
    // See: https://github.com/microsoft/vscode/issues/131208
    //      https://github.com/microsoft/vscode/issues/67559
    //      https://github.com/microsoft/vscode/issues/40500
    await vscode.commands.executeCommand('setContext', 'spe:isAdmin', false);
    await vscode.commands.executeCommand('setContext', 'spe:isActivated', false);

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
        onBeforeSignIn: () => {
            // Lock tree to return [] before isLoggingIn makes it visible
            DevelopmentTreeViewProvider.getInstance().emptyTree();
        },
        onSignIn: async () => {
            const devTree = DevelopmentTreeViewProvider.getInstance();
            devTree.clearRootItems();
            devTree.refresh();
            // Wait for tree to load new data before making view visible
            await devTree.getChildren();
            await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', true);
            // Compat: set spe:isAdmin for stale cached package.json from <= 1.0.2
            // where the dev view used when: "spe:isAdmin". No-op after window reload.
            await vscode.commands.executeCommand('setContext', 'spe:isAdmin', true);
            // Now that the dev tree is ready, flip account node from spinner to username
            AccountTreeViewProvider.getInstance().m365AccountNode.showReady();
        },
        onSignOut: () => {
            // Empty tree while still visible so VS Code's cache clears
            DevelopmentTreeViewProvider.getInstance().emptyTree();
            // Compat: clear spe:isAdmin for stale cached package.json from <= 1.0.2
            vscode.commands.executeCommand('setContext', 'spe:isAdmin', false);
        }
    });

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
    Commands.BrowseGraphExplorer.register(context);
    Commands.RegisterOnLocalTenant.register(context);
    Commands.RenameContainerType.register(context);
    Commands.LearnMoreDiscoverability.register(context);
    Commands.EnableContainerTypeDiscoverability.register(context);
    Commands.DisableContainerTypeDiscoverability.register(context);
    Commands.GrantExtensionAppPermissions.register(context);

    // App Context Menu Commands
    Commands.CopyPostmanConfig.register(context);
    Commands.GetLocalAdminConsent.register(context);
    Commands.OpenPostmanDocumentation.register(context);

    // App Commands
    Commands.GetOrCreateApp.register(context);
    Commands.GetOrCreateGuestApp.register(context);
    Commands.AddGraphExplorerPermissions.register(context);
    Commands.AddConnectorPermissions.register(context);
    Commands.AddExtensionPermissions.register(context);
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

    await vscode.commands.executeCommand('setContext', 'spe:isActivated', true);
}


// Cleanup when extension is deactivated
export function deactivate() {
    AccountTreeViewProvider.resetInstance();
    DevelopmentTreeViewProvider.resetInstance();
}
