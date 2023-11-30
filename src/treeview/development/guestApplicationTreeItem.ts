/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { TreeViewCommand } from "./treeViewCommand";
import { App } from "../../models/App";
import { ContainerType } from "../../models/ContainerType";

export class GuestApplicationTreeItem extends vscode.TreeItem {
    constructor(
        public app: App,
        public containerType: ContainerType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
        this.iconPath = new vscode.ThemeIcon("app-icon");
        this.contextValue = "guestApplication";
    }

    public async getChildren() {
        [this]
    }
}