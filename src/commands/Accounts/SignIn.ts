/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';
import { SignInEvent, SignInFailure } from '../../models/telemetry/telemetry';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import { AuthenticationState } from '../../services/AuthenticationState';

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
            const errorMessage = error?.message || String(error);
            const message = errorMessage.includes('platform_broker_error')
                ? vscode.l10n.t('Microsoft sign-in failed. SharePoint Embedded supports work or school accounts only. If you selected a personal Microsoft account, try again and choose a work or school account.')
                : vscode.l10n.t('Failed to sign in, please try again: {0}', errorMessage);
            vscode.window.showErrorMessage(message);
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
            TelemetryProvider.instance.send(new SignInFailure(errorMessage));
        }
    }
}
