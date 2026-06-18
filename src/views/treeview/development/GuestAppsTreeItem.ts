/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./GuestAppTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
import { blockBillingInvalid } from "./BillingDecorationProvider";

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
                    // Block sample apps + postman submenus on guest apps too —
                    // they don't work without containers, which need billing.
                    // No yellow tint — the warning stays on the CT/registration row.
                    blockBillingInvalid(child);
                }
                children.push(child);
            });
        } catch (error: any) {
            console.error('[GuestAppsTreeItem.getChildren]', error);
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to load app permissions: {0}', error?.message || String(error))
            );
        }

        return children;
    }

}
