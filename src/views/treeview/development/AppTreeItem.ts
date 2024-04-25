/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../../models/ContainerType";
import { App } from "../../../models/App";

export class AppTreeItem extends vscode.TreeItem {
    constructor(app: App | string) {
        const label = typeof app === "string" ? app : app.name;
        super(label,  vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("app-icon");
        this.contextValue = "spe:appTreeItem";
    }
}