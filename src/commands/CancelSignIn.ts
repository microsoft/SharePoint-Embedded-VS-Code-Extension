/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import TelemetryProvider from '../services/TelemetryProvider';
import { Command } from './Command';
import * as vscode from 'vscode';

// Static class that handles the sign in command
export class CancelSignIn extends Command {
    // Command name
    public static readonly COMMAND = 'cancelSignIn';

    // Command handler
    public static async run(): Promise<void> {
        try {
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to cancel sign in flow.');
            console.error('Error:', error);
            TelemetryProvider.get().sendTelemetryErrorEvent('cancel sign', { description: 'Failed to cancel sign in flow.', error: error });
        }
    }
}
