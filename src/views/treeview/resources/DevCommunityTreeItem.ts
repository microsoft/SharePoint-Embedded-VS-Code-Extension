/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class DevCommunityTreeItem extends vscode.TreeItem {
    public constructor() {
        super("Developer community",  vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("code");
    }
}