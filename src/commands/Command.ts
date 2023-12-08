/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export abstract class Command {
    public static readonly COMMAND: string;

    public static register(context: vscode.ExtensionContext): void {
        const commandName = `spe.${this.COMMAND}`;
        const command = vscode.commands.registerCommand(commandName, this.run);
        context.subscriptions.push(command);
    }

    public static async run(): Promise<void> {
        throw new Error('Not implemented.');
    }
}