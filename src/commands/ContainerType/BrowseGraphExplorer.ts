/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';

const GRAPH_EXPLORER_URL = 'https://developer.microsoft.com/en-us/graph/graph-explorer?devx-api=https://devxapi-func-prod-eastus.azurewebsites.net&org=marcwindle&branchName=mawin/add-sharepoint-embedded-sample-queries';

// Static class that opens Graph Explorer to browse SharePoint Embedded APIs
export class BrowseGraphExplorer extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.browseGraphExplorer';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        vscode.env.openExternal(vscode.Uri.parse(GRAPH_EXPLORER_URL));
    }
}
