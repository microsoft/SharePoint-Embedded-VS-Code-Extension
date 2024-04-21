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
    public constructor(private readonly _account: Account) {
        super(ContainerTypesTreeItem.label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = "spe:containerTypesTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        if (!this._account.containerTypes || this._account.containerTypes.length === 0) {
            return [];
        }
        return this._account.containerTypes.map(ct => new ContainerTypeTreeItem(ct));
    }
}