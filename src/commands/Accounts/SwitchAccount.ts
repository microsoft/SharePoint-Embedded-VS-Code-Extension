/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';
import { AuthenticationState } from '../../services/AuthenticationState';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the switch account command
export class SwitchAccount extends Command {
    // Command name
    public static readonly COMMAND = 'switchAccount';

    // Command handler
    public static async run(): Promise<void> {
        try {
            // Lock the dev tree to return [] — must happen BEFORE isLoggingIn
            // makes the tree visible, so VS Code never sees stale items.
            DevelopmentTreeViewProvider.getInstance().emptyTree();

            await vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
            await vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
            await AuthenticationState.signOut();
            await AuthenticationState.signIn();
        } catch (error: any) {
            // If sign-in fails after sign-out, clear the logging-in state
            // so the welcome view appears for the user to retry
            await vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
            const message = vscode.l10n.t(`Failed to switch account: {0}`, error.message || error);
            vscode.window.showErrorMessage(message);
        }
    }
}
