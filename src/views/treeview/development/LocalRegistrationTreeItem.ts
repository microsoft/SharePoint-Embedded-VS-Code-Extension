/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerType, ContainerTypeRegistration } from "../../../models/schemas";
import { AuthenticationState } from "../../../services/AuthenticationState";
import { ContainersTreeItem } from "./ContainersTreeItem";
import { GuestAppsTreeItem } from "./GuestAppsTreeItem";
import { RecycledContainersTreeItem } from "./RecycledContainersTreeItem";

export class LocalRegistrationTreeItem extends IChildrenProvidingTreeItem {
    constructor(
        private readonly _containerType: ContainerType,
        private readonly _registration: ContainerTypeRegistration
    ) {
        super(vscode.l10n.t('Local tenant registration'), vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon("ctregistration-icon");

        // Get domain from username
        const domain = this.getTenantDomain();
        this.description = `(${domain})`;

        this.contextValue = "spe:localRegistrationTreeItem";
    }

    /**
     * Get the tenant domain from available sources
     */
    private getTenantDomain(): string {
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

        children.push(new GuestAppsTreeItem(this._containerType.id, this._containerType.owningAppId));
        children.push(new ContainersTreeItem(this._containerType.id, this));
        children.push(new RecycledContainersTreeItem(this._containerType.id, this));

        return children;
    }
}
