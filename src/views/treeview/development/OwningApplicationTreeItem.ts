/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../../models/ContainerType";
import { App } from "../../../models/App";
import { ApplicationTreeItem } from "./ApplicationTreeItem";

export class OwningApplicationTreeItem extends ApplicationTreeItem {
    constructor(
        public app: App,
        public containerType: ContainerType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean },
        public commandArguments?: any[],
    ) {
        super(app, containerType, label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon("app-icon");
        this.contextValue = "owningApplication";
        this.description = "owning application";
        this.tooltip = new vscode.MarkdownString(
`
#### App Name: ${app.displayName} 
#### App Id: ${app.clientId} 
`
        );
    }
}