/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./GuestAppTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
import { blockBillingInvalid, tintBillingInvalid } from "./BillingDecorationProvider";

export class GuestAppsTreeItem extends IChildrenProvidingTreeItem {

    constructor(
        public readonly containerTypeId: string,
        public readonly owningAppId: string,
        private readonly _billingInvalid: boolean = false
    ) {
        super(vscode.l10n.t('App Permissions'), vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:guestAppsTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children: vscode.TreeItem[] = [];

        try {
            const grants = await GraphProvider.getInstance().appPermissionGrants.list(this.containerTypeId);
            grants.map((grant) => {
                const child = new GuestApplicationTreeItem(grant, this.containerTypeId, this);
                if (this._billingInvalid) {
                    tintBillingInvalid(child, `${this.containerTypeId}-guest-${grant.appId}`);
                    // Block sample apps + postman submenus on guest apps too —
                    // they don't work without containers, which need billing.
                    blockBillingInvalid(child);
                }
                children.push(child);
            });
        } catch (error) {
            console.error('[GuestAppsTreeItem.getChildren]', error);
        }

        return children;
    }

}
