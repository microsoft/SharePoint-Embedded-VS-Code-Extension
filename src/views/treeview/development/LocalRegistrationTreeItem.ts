/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerType, ContainerTypeRegistration } from "../../../models/schemas";
import { Account } from "../../../models/Account";
import { AuthenticationState } from "../../../services/AuthenticationState";
// TODO: Update these tree items for new schema
// import { ContainersTreeItem } from "./ContainersTreeItem";
// import { GuestAppsTreeItem } from "./GuestAppsTreeItem";
// import { RecycledContainersTreeItem } from "./RecycledContainersTreeItem";

export class LocalRegistrationTreeItem extends IChildrenProvidingTreeItem {
    constructor(
        private readonly _containerType: ContainerType,
        private readonly _registration: ContainerTypeRegistration
    ) {
        super(vscode.l10n.t('Local tenant registration'), vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon("ctregistration-icon");

        // Get domain from Account if available, otherwise extract from username
        const domain = this.getTenantDomain();
        this.description = `(${domain})`;

        this.contextValue = "spe:localRegistrationTreeItem";
    }

    /**
     * Get the tenant domain from available sources
     */
    private getTenantDomain(): string {
        // Try to get from legacy Account first
        const account = Account.get();
        if (account?.domain) {
            return account.domain;
        }

        // Fall back to extracting from username in new auth system
        const authAccount = AuthenticationState.getCurrentAccountSync();
        if (authAccount?.username) {
            // Username is typically an email like user@domain.onmicrosoft.com
            const atIndex = authAccount.username.indexOf('@');
            if (atIndex !== -1) {
                const fullDomain = authAccount.username.substring(atIndex + 1);
                // Extract the tenant name (first part before .onmicrosoft.com or first dot)
                const dotIndex = fullDomain.indexOf('.');
                if (dotIndex !== -1) {
                    return fullDomain.substring(0, dotIndex);
                }
                return fullDomain;
            }
        }

        // Last resort - use tenant ID if available
        if (authAccount?.tenantId) {
            return authAccount.tenantId.substring(0, 8) + '...';
        }

        return 'local';
    }

    public get containerType(): ContainerType {
        return this._containerType;
    }

    public get registration(): ContainerTypeRegistration {
        return this._registration;
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children: vscode.TreeItem[] = [];

        // TODO: Re-enable these when updated for new schema
        // children.push(new GuestAppsTreeItem(this._registration));
        // children.push(new ContainersTreeItem(this._registration, this));
        // children.push(new RecycledContainersTreeItem(this._registration, this));

        // For now, show a placeholder item indicating future children
        const placeholderItem = new vscode.TreeItem(
            vscode.l10n.t('Guest Apps, Containers (coming soon)'),
            vscode.TreeItemCollapsibleState.None
        );
        placeholderItem.iconPath = new vscode.ThemeIcon("info");
        children.push(placeholderItem);

        return children;
    }
}
