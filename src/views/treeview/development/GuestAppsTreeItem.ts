/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./GuestAppTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";

export class GuestAppsTreeItem extends IChildrenProvidingTreeItem {

    constructor(public readonly containerTypeId: string, public readonly owningAppId: string) {
        super(vscode.l10n.t('App Permissions'), vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:guestAppsTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children: vscode.TreeItem[] = [];

        try {
            const grants = await GraphProvider.getInstance().appPermissionGrants.list(this.containerTypeId);
            grants.map((grant) => {
                children.push(new GuestApplicationTreeItem(grant, this.containerTypeId, this));
            });
        } catch (error) {
            console.error('[GuestAppsTreeItem.getChildren]', error);
        }

        return children;
    }

}
