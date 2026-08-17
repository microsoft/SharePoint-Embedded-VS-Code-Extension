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
        const registrationsByContainerTypeId = await this._loadRegistrations();

        const treeItems = await Promise.all(
            this._containerTypes.map(async (ct) => {
                // `null` means "known to be unregistered"; `undefined` means the bulk
                // list didn't run, so fall back to a per-container-type read.
                let registration = registrationsByContainerTypeId?.get(ct.id) ?? null;
                if (!registrationsByContainerTypeId) {
                    try {
                        registration = await graphProvider.registrations.get(ct.id);
                    } catch (error) {
                        console.log(`[ContainerTypesTreeItem] Could not get registration for ${ct.id}:`, error);
                    }
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

    /**
     * Fetch every registration in the tenant with a single request instead of one
     * `GET .../containerTypeRegistrations/{id}` per container type. The registration id
     * is the container type id, so the result maps straight onto the container types.
     *
     * Returns `undefined` if the bulk read fails, which tells the caller to fall back
     * to the per-container-type reads so a partial outage still renders the tree.
     */
    private async _loadRegistrations(): Promise<Map<string, ContainerTypeRegistration> | undefined> {
        try {
            const graphProvider = GraphProvider.getInstance();
            const registrations = await graphProvider.registrations.list();
            return new Map(registrations.map(reg => [reg.id, reg]));
        } catch (error) {
            console.log('[ContainerTypesTreeItem] Bulk registration list failed, falling back to per-container-type reads:', error);
            return undefined;
        }
    }
}