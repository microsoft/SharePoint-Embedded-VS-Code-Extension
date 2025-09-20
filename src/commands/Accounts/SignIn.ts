/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';
import { AuthenticationState } from '../../services/AuthenticationState';
import { SignInEvent, SignInFailure } from '../../models/telemetry/telemetry';
import { TelemetryProvider } from '../../services/TelemetryProvider';

// Static class that handles the sign in command
export class SignIn extends Command {
    // Command name
    public static readonly COMMAND = 'login';

    // Command handler
    public static async run(): Promise<void> {
        try {
            await AuthenticationState.signIn();
            TelemetryProvider.instance.send(new SignInEvent());
        } catch (error: any) {
            const message = vscode.l10n.t('{0} Failed to sign in, please try again.', error);
            vscode.window.showErrorMessage(message);
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
            TelemetryProvider.instance.send(new SignInFailure(error.message));
        }
    }
}
