/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';

// Static class that opens Postman Collection documentation
export class OpenPostmanDocumentation extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.viewDocs';

    // Command handler
    public static async run(): Promise<void> {
        const postmanDocsUrl = 'https://github.com/microsoft/SharePoint-Embedded-Samples/tree/main/Postman';
        vscode.env.openExternal(vscode.Uri.parse(postmanDocsUrl));
    };
}
