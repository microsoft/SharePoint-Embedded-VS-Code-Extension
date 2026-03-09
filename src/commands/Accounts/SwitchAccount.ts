/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';
import { AuthenticationState } from '../../services/AuthenticationState';

// Static class that handles the switch account command
export class SwitchAccount extends Command {
    // Command name
    public static readonly COMMAND = 'switchAccount';

    // Command handler
    public static async run(): Promise<void> {
        try {
            await AuthenticationState.signOut();
            await AuthenticationState.signIn();
        } catch (error: any) {
            const message = vscode.l10n.t(`Failed to switch account: {0}`, error.message || error);
            vscode.window.showErrorMessage(message);
        }
    }
}
