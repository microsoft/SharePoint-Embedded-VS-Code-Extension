/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './../Command';
import * as vscode from 'vscode';
import { Account } from '../../models/Account';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { SignOutEvent, SignOutFailure } from '../../models/telemetry/telemetry';
import { TelemetryProvider } from '../../services/TelemetryProvider';

// Static class that handles the sign out command
export class SignOut extends Command {
    // Command name
    public static readonly COMMAND = 'signOut';

    // Command handler
    public static async run(): Promise<void> {
        try {
            const message = "Are you sure you want to sign out?";
            const userChoice = await vscode.window.showInformationMessage(
                message,
                'OK', 'Cancel'
            );

            if (userChoice === 'Cancel') {
                return;
            }

            await Account.get()!.logout();
            DevelopmentTreeViewProvider.instance.refresh();
            TelemetryProvider.instance.send(new SignOutEvent());
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            TelemetryProvider.instance.send(new SignOutFailure(error.message));
        }
    }
}
