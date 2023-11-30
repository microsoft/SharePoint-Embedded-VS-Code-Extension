/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../models/ContainerType";
import { App } from "../../models/App";

export class OwningApplicationTreeItem extends vscode.TreeItem {
    constructor(
        public app: App,
        public containerType: ContainerType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean },
        public commandArguments?: any[],
    ) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon("owningapp-icon");
        this.contextValue = "owningApplication";
        this.description = "owning application";
        this.tooltip = new vscode.MarkdownString(
`
## ${app.displayName} ##
Here is an awesome tooltip for this owning application. 
1. App Id: ${app.clientId}}
1. Another line!
`
        );
    }

    public async getChildren() {
        return [this];
    }
}