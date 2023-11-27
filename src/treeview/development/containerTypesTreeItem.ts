/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../models/ContainerType";
import { Account } from "../../models/Account";
import { ContainerTypeTreeItem } from "./containerTypeTreeItem";

export class ContainerTypesTreeItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState);
        this.setImagetoIcon();
    }

    public async getChildren() {
        const containerTypes: ContainerType[] = Account.get()!.containerTypes;

        const containerTypeTreeItems = [...containerTypes.map(containerType => {
            const containerTypeTreeItem = new ContainerTypeTreeItem(containerType, containerType.displayName, containerType.displayName, vscode.TreeItemCollapsibleState.Expanded, { name: "symbol-function", custom: false })
            return containerTypeTreeItem;
        })]

        return containerTypeTreeItems;
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