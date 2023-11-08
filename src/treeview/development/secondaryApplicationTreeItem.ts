/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { TreeViewCommand } from "./treeViewCommand";
import { App } from "../../models/App";
import { ContainerType } from "../../models/ContainerType";

export class SecondaryApplicationTreeItem extends vscode.TreeItem {
    constructor(
        public app: App,
        public containerType: ContainerType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.contextValue = "secondaryApplication";
    }

    public async getChildren() {
        [this]
    }

    private setImagetoIcon() {
        if (this.image !== undefined) {
            if (!this.image.custom) {
                this.iconPath = new vscode.ThemeIcon(
                    this.image.name,
                    new vscode.ThemeColor("icon.foreground")
                );
            }
        }
    }

}