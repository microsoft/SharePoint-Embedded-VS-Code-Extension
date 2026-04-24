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
import { Logger } from "../../../utils/Logger";

export class LocalRegistrationTreeItem extends IChildrenProvidingTreeItem {
    constructor(
        private readonly _containerType: ContainerType,
        private readonly _registration: ContainerTypeRegistration
    ) {
        super(vscode.l10n.t('Local tenant registration'), vscode.TreeItemCollapsibleState.Collapsed);

        const domain = this.getTenantDomain();
        this.description = `(${domain})`;
        this.contextValue = "spe:localRegistrationTreeItem";

        // Flag registrations whose billing isn't set up. For direct-to-customer
        // container types billing is per-consuming-tenant, so this is how a
        // consumer admin sees "nothing here works yet, attach billing first."
        // For standard CTs billing is owner-side, but a stale billingStatus on
        // the registration still signals the CT is unusable in this tenant.
        const billingInvalid = this._registration.billingStatus !== 'valid';
        Logger.log(`[LocalRegistrationTreeItem] ${this._containerType.name} registration: classification=${this._registration.billingClassification ?? '(undef)'} billingStatus=${this._registration.billingStatus ?? '(undef)'} billingInvalid=${billingInvalid}`);
        if (billingInvalid) {
            this.description = `${this.description} — billing not set up`;
            this.iconPath = new vscode.ThemeIcon(
                "ctregistration-icon",
                new vscode.ThemeColor("list.warningForeground")
            );
            this.tooltip = new vscode.MarkdownString(
                vscode.l10n.t(
                    '**Billing is not attached to this registration.**\n\nThe container type can\'t be used in this tenant until an Azure billing account is linked. Right-click and choose **Attach billing** to finish setup.'
                )
            );
            this.contextValue += "-billingInvalid";
        } else {
            this.iconPath = new vscode.ThemeIcon("ctregistration-icon");
        }
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
