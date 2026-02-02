/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerType, ContainerTypeRegistration } from "../../../models/schemas";
import { GraphProvider } from "../../../services/Graph/GraphProvider";

export class ContainerTypesTreeItem extends IChildrenProvidingTreeItem {
    private static readonly label = vscode.l10n.t("Container Types");
    public constructor(private _containerTypes: ContainerType[]) {
        super(ContainerTypesTreeItem.label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        this.contextValue = "spe:containerTypesTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const graphProvider = GraphProvider.getInstance();

        // Check registration status for each container type
        const treeItems = await Promise.all(
            this._containerTypes.map(async (ct) => {
                let registration: ContainerTypeRegistration | null = null;
                try {
                    registration = await graphProvider.registrations.get(ct.id);
                } catch (error) {
                    console.log(`[ContainerTypesTreeItem] Could not get registration for ${ct.id}:`, error);
                }
                return new ContainerTypeTreeItem(ct, registration);
            })
        );

        return treeItems;
    }
}