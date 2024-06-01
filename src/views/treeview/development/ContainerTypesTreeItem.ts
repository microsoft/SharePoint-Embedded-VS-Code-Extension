/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Account } from "../../../models/Account";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerType } from "../../../models/ContainerType";

export class ContainerTypesTreeItem extends IChildrenProvidingTreeItem {
    private static readonly label = "Container Types";
    public constructor(private _containerTypes: ContainerType[]) {
        super(ContainerTypesTreeItem.label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        this.contextValue = "spe:containerTypesTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        return this._containerTypes.map(ct => new ContainerTypeTreeItem(ct));
    }
}