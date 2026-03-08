/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';
import { AuthenticationState } from '../../services/AuthenticationState';

// Static class that handles the cancel sign in command
export class CancelSignIn extends Command {
    // Command name
    public static readonly COMMAND = 'cancelSignIn';

    // Command handler
    public static async run(): Promise<void> {
        try {
            AuthenticationState.cancelSignIn();
        } catch (error) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to cancel sign in flow.'));
        }
    }
}
