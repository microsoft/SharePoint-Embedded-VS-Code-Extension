/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerType, ContainerTypeRegistration } from "../../../models/schemas";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
import { hasExtensionAppPermissions } from "../../../utils/ExtensionAppPermissions";

export class ContainerTypesTreeItem extends IChildrenProvidingTreeItem {
    private static readonly label = vscode.l10n.t("Container Types");
    private _cachedChildren: ContainerTypeTreeItem[] | undefined;

    public constructor(private _containerTypes: ContainerType[]) {
        super(ContainerTypesTreeItem.label, vscode.TreeItemCollapsibleState.Expanded);
        this.id = "spe-container-types";
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        const hasTrialCT = _containerTypes.some(ct => ct.billingClassification === 'trial');
        this.contextValue = hasTrialCT
            ? "spe:containerTypesTreeItem-hasTrialCT"
            : "spe:containerTypesTreeItem";
    }

    public getCachedChildren(): ContainerTypeTreeItem[] | undefined {
        return this._cachedChildren;
    }

    public clearChildrenCache(): void {
        this._cachedChildren = undefined;
    }

    public async findContainerTypeById(containerTypeId: string): Promise<ContainerTypeTreeItem | undefined> {
        const children = await this.getChildren();
        return (children as ContainerTypeTreeItem[]).find(
            (item) => item.containerType.id === containerTypeId
        );
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        if (this._cachedChildren) {
            return this._cachedChildren;
        }

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

                // Check extension app permissions for registered container types
                let hasPermissions = false;
                if (registration) {
                    try {
                        hasPermissions = await hasExtensionAppPermissions(ct.id);
                    } catch (error) {
                        console.log(`[ContainerTypesTreeItem] Could not check permissions for ${ct.id}:`, error);
                    }
                }

                return new ContainerTypeTreeItem(ct, registration, hasPermissions);
            })
        );

        this._cachedChildren = treeItems;
        return treeItems;
    }
}