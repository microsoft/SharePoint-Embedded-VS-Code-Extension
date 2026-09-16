/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationState } from './services/AuthenticationState';
import { GraphAuthProvider } from './services/Auth';
import { LocalStorageService, StorageProvider } from './services/StorageProvider';
import { ext } from './utils/extensionVariables';
import { AccountTreeViewProvider } from './views/treeview/account/AccountTreeViewProvider';
import { BillingDecorationProvider } from './views/treeview/development/BillingDecorationProvider';
import { DevelopmentTreeViewProvider } from './views/treeview/development/DevelopmentTreeViewProvider';

const WEB_COMMANDS = {
    cancelSignIn: 'spe.cancelSignIn',
    refresh: 'spe.refresh',
    signIn: 'spe.login',
    signOut: 'spe.signOut',
    switchAccount: 'spe.switchAccount'
} as const;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await setInitialContext();

    ext.context = context;
    ext.outputChannel = vscode.window.createOutputChannel('SharePoint Embedded', { log: true });
    context.subscriptions.push(ext.outputChannel);

    StorageProvider.init(
        new LocalStorageService(context.globalState),
        new LocalStorageService(context.workspaceState),
        context.secrets
    );
    await StorageProvider.purgeOldCache();

    const accountTree = AccountTreeViewProvider.getInstance();
    const developmentTree = DevelopmentTreeViewProvider.getInstance();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(AccountTreeViewProvider.viewId, accountTree)
    );

    const developmentTreeView = vscode.window.createTreeView(DevelopmentTreeViewProvider.viewId, {
        treeDataProvider: developmentTree
    });
    developmentTree.setTreeView(developmentTreeView);
    context.subscriptions.push(developmentTreeView);
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(BillingDecorationProvider.getInstance())
    );

    AuthenticationState.subscribe({
        onBeforeSignIn: () => developmentTree.emptyTree(),
        onSignIn: async () => {
            developmentTree.clearRootItems();
            developmentTree.refresh();
            await developmentTree.getChildren();
            await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', true);
            accountTree.m365AccountNode.showReady();
        },
        onSignOut: () => developmentTree.emptyTree()
    });

    registerWebCommands(context, developmentTree);

    try {
        await AuthenticationState.initialize();
    } catch (error) {
        console.error('[extension.web] Authentication initialization failed:', error);
        await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
        await vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
        await vscode.commands.executeCommand('setContext', 'spe:signInReady', true);
    }

    await vscode.commands.executeCommand('setContext', 'spe:isActivated', true);
}

export function deactivate(): void {
    AccountTreeViewProvider.resetInstance();
    DevelopmentTreeViewProvider.resetInstance();
}

async function setInitialContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'spe:isWeb', true);
    await vscode.commands.executeCommand('setContext', 'spe:signInReady', false);
    await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
    await vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
    await vscode.commands.executeCommand('setContext', 'spe:isAdmin', false);
    await vscode.commands.executeCommand('setContext', 'spe:isActivated', false);
}

function registerWebCommands(
    context: vscode.ExtensionContext,
    developmentTree: DevelopmentTreeViewProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(WEB_COMMANDS.signIn, async () => {
            try {
                await AuthenticationState.signIn();
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to sign in, please try again: {0}', detail)
                );
            }
        }),
        vscode.commands.registerCommand(WEB_COMMANDS.signOut, async () => {
            const ok = vscode.l10n.t('OK');
            const choice = await vscode.window.showInformationMessage(
                vscode.l10n.t('Are you sure you want to sign out?'),
                ok,
                vscode.l10n.t('Cancel')
            );
            if (choice !== ok) {
                return;
            }

            await AuthenticationState.signOut();
            developmentTree.refresh();
        }),
        vscode.commands.registerCommand(WEB_COMMANDS.switchAccount, async () => {
            developmentTree.emptyTree();
            await vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
            await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
            await AuthenticationState.signOut();
            await AuthenticationState.signIn();
        }),
        vscode.commands.registerCommand(WEB_COMMANDS.cancelSignIn, () => {
            AuthenticationState.cancelSignIn();
        }),
        vscode.commands.registerCommand(WEB_COMMANDS.refresh, (treeItem?: vscode.TreeItem) => {
            developmentTree.refresh(treeItem);
        })
    );
}
