/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { OwningAppTreeItem } from "./OwningAppTreeItem";
import { ContainerType, ContainerTypeRegistration } from "../../../models/schemas";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";
import { Logger } from "../../../utils/Logger";
import { badgeBillingInvalid, blockBillingInvalid, tintBillingInvalid } from "./BillingDecorationProvider";

export class ContainerTypeTreeItem extends IChildrenProvidingTreeItem {
    public readonly registration: ContainerTypeRegistration | null;
    public readonly subtreeBillingInvalid: boolean;

    constructor(
        public readonly containerType: ContainerType,
        registration: ContainerTypeRegistration | null = null,
        hasExtensionPermissions: boolean = false
    ) {
        super(containerType.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `spe-ct-${containerType.id}`;
        this.registration = registration;
        this.contextValue = "spe:containerTypeTreeItem";

        // Tag the contextValue with billing classification so the package.json
        // `when` clauses can gate menu items. `-paid` is kept as an alias for
        // standard so existing predicates (e.g. copySubscriptionId) keep
        // matching. Per PM review only trial CTs get a description suffix —
        // standard / DTC render with no annotation.
        const classification = containerType.billingClassification;
        switch (classification) {
            case 'trial': {
                let expirationString = '';
                if (containerType.expirationDateTime) {
                    const expirationDate = new Date(containerType.expirationDateTime);
                    const now = new Date();
                    const diffTime = expirationDate.getTime() - now.getTime();
                    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (daysLeft > 0) {
                        expirationString = ` expires in ${daysLeft} day`;
                        if (daysLeft !== 1) {
                            expirationString += 's';
                        }
                    } else {
                        expirationString = ' expired';
                    }
                }
                this.description = `(trial${expirationString})`;
                this.contextValue += "-trial";
                break;
            }
            case 'directToCustomer':
                this.contextValue += "-directToCustomer";
                break;
            case 'standard':
            default:
                this.contextValue += "-standard-paid";
                break;
        }

        // Flag container types whose billing isn't set up yet. The ARM /
        // Syntex-account flow (AttachBilling command) is the same for both
        // standard and directToCustomer — the difference is which tenant's
        // subscription gets picked: for standard it's the owner org's sub,
        // for directToCustomer the user-org admin runs the same flow against
        // the user org's sub.
        const isStandard = classification === 'standard' || classification === undefined;
        const isDirectToCustomer = classification === 'directToCustomer';
        const ctBillingInvalid = (isStandard || isDirectToCustomer) && containerType.billingStatus !== 'valid';
        const regBillingInvalid = !!registration && registration.billingStatus !== 'valid';
        const billingInvalid = ctBillingInvalid;
        this.subtreeBillingInvalid = ctBillingInvalid || regBillingInvalid;
        Logger.log(`[ContainerTypeTreeItem] ${containerType.name}: classification=${classification ?? '(undef)'} billingStatus=${containerType.billingStatus ?? '(undef)'} ctBillingInvalid=${ctBillingInvalid} regBillingInvalid=${regBillingInvalid}`);
        if (billingInvalid) {
            const existing = this.description ? `${this.description} ` : '';
            this.description = `${existing}BILLING NOT SET UP`;
            this.iconPath = new vscode.ThemeIcon(
                "containertype-icon",
                new vscode.ThemeColor("list.warningForeground")
            );
            badgeBillingInvalid(this, this.id);
            this.tooltip = new vscode.MarkdownString(
                isDirectToCustomer
                    ? vscode.l10n.t(
                        '**Billing is not set up for this container type.**\n\nDirect-to-customer container types are billed per consuming tenant. A Global Administrator in the user organization sets up pay-as-you-go billing for SharePoint Embedded in the Microsoft 365 admin center. Expand this container type and check the registration row for the most up-to-date billing status in this tenant.'
                    )
                    : vscode.l10n.t(
                        '**Billing is not attached to this container type.**\n\nIt can\'t be used until an Azure Syntex billing account is linked. Right-click and choose **Attach billing** to finish setup.'
                    )
            );
            this.contextValue += "-billingInvalid";
        } else {
            this.iconPath = new vscode.ThemeIcon("containertype-icon");
        }

        // Check discoverability status
        const isDiscoverabilityEnabled = containerType.settings?.isDiscoverabilityEnabled === true;
        this.contextValue += isDiscoverabilityEnabled ? "-discoverabilityEnabled" : "-discoverabilityDisabled";

        // Set registration status based on passed registration
        this.contextValue += registration ? "-registered" : "-unregistered";

        // Set extension app permissions status (only relevant for registered types)
        if (registration && hasExtensionPermissions) {
            this.contextValue += "-extensionPermissionsGranted";
        }
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children: vscode.TreeItem[] = [];

        try {
            // Add owning app tree item
            const owningApp = new OwningAppTreeItem(this.containerType, this);
            if (this.subtreeBillingInvalid) {
                tintBillingInvalid(owningApp, `${this.containerType.id}-owning-app`);
                blockBillingInvalid(owningApp);
            }
            children.push(owningApp);

            // Add registration tree item if registered
            if (this.registration) {
                children.push(new LocalRegistrationTreeItem(this.containerType, this.registration, this.subtreeBillingInvalid));
            }
        } catch (error) {
            console.error('Error loading container type children:', error);
        }

        return children;
    }
}
