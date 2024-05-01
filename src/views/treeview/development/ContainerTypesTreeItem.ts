/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Account } from "../../../models/Account";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";

export class ContainerTypesTreeItem extends IChildrenProvidingTreeItem {
    private static readonly label = "Container Types";
    public constructor() {
        super(ContainerTypesTreeItem.label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = "spe:containerTypesTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const account = Account.get();
        if (!account) {
            return [];
        }
        const containerTypeProvider = account.containerTypeProvider;
        const containerTypes = await containerTypeProvider.list();
        if (!containerTypes) {
            return [];
        }
        return containerTypes.map(ct => new ContainerTypeTreeItem(ct));
    }
}