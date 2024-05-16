
//App.viewInAzure

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { App } from '../../../models/App';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { GetAccount } from '../../Accounts/GetAccount';
import { Command } from '../../Command';

// Static class that opens Postman Collection documentation
export class OpenPostmanDocumentation extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.viewDocs';

    // Command handler
    public static async run(commandProps?: OpenPostmanDocumentationProps): Promise<void> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let app: App | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps.app && commandProps.app instanceof App) {
                app = commandProps.app;
            }
        } else {
            app = commandProps;
        }
        if (!app) {
            return;
        }

        const postmanDocsUrl = 'https://github.com/microsoft/SharePoint-Embedded-Samples/tree/main/Postman';
        vscode.env.openExternal(vscode.Uri.parse(postmanDocsUrl));
    };
}

export type OpenPostmanDocumentationProps = AppTreeItem | App;
