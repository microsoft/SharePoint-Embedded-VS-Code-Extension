/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';

// Static class that views app in Azure
export class OpenDocumentation extends Command {
    // Command name
    public static readonly COMMAND = 'Resources.openDocumentation';

    // Command handler
    public static async run(): Promise<void> {
        
        const docsLink = "https://aka.ms/start-spe";
        vscode.env.openExternal(vscode.Uri.parse(docsLink));
    };
}

