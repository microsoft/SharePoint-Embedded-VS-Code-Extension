/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class DocumentationTreeItem extends vscode.TreeItem {
    public constructor() {
        super("Documentation",  vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("book");
        this.command = {
            title: "Documentation",
            command: "spe.Resources.openDocumentation"
        };
    }
}