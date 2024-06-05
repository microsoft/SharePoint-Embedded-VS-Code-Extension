/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';

// Static class that handles the sign in command
export class CancelSignIn extends Command {
    // Command name
    public static readonly COMMAND = 'cancelSignIn';

    // Command handler
    public static async run(): Promise<void> {
        try {
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to cancel sign in flow.');
        }
    }
}
