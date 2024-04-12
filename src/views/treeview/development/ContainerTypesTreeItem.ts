/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../../models/ContainerType";
import { Account } from "../../../models/Account";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";

export class ContainerTypesTreeItem extends vscode.TreeItem {
    private static readonly label = "Container Types";
    public constructor() {
        super(ContainerTypesTreeItem.label, vscode.TreeItemCollapsibleState.Expanded);
    }

    public async getChildren() {
        const containerTypes: ContainerType[] = Account.get()!.containerTypes;

        const containerTypeTreeItems = [...containerTypes.map(containerType => {
            return new ContainerTypeTreeItem(containerType);
        })];

        return containerTypeTreeItems;
    }
}