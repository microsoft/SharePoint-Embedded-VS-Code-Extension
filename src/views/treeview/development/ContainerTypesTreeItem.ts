/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../../models/ContainerType";
import { Account } from "../../../models/Account";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";

export class ContainerTypesTreeItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState

    ) {
        super(label, collapsibleState);
    }

    public async getChildren() {
        const containerTypes: ContainerType[] = Account.get()!.containerTypes;

        const containerTypeTreeItems = [...containerTypes.map(containerType => {
            const containerTypeTreeItem = new ContainerTypeTreeItem(containerType, containerType.displayName, containerType.displayName, vscode.TreeItemCollapsibleState.Expanded);
            return containerTypeTreeItem;
        })];

        return containerTypeTreeItems;
    }
}