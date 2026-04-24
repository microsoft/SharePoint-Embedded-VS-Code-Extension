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

export class ContainerTypeTreeItem extends IChildrenProvidingTreeItem {
    public readonly registration: ContainerTypeRegistration | null;

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
        // standard so existing predicates (e.g. copySubscriptionId) keep matching.
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
                this.description = '(direct to customer)';
                this.contextValue += "-directToCustomer";
                break;
            case 'standard':
            default:
                this.description = '(standard)';
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
        const billingInvalid = (isStandard || isDirectToCustomer) && containerType.billingStatus !== 'valid';
        Logger.log(`[ContainerTypeTreeItem] ${containerType.name}: classification=${classification ?? '(undef)'} billingStatus=${containerType.billingStatus ?? '(undef)'} billingInvalid=${billingInvalid}`);
        if (billingInvalid) {
            this.description = `${this.description ?? ''} — billing not set up`;
            this.iconPath = new vscode.ThemeIcon(
                "containertype-icon",
                new vscode.ThemeColor("list.warningForeground")
            );
            this.tooltip = new vscode.MarkdownString(
                isDirectToCustomer
                    ? vscode.l10n.t(
                        '**Billing is not attached to this container type.**\n\nApp usage is billed to the user organization. An admin in the user org needs to run **Attach billing** to link an Azure billing account in their tenant.'
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
            children.push(new OwningAppTreeItem(this.containerType, this));

            // Add registration tree item if registered
            if (this.registration) {
                children.push(new LocalRegistrationTreeItem(this.containerType, this.registration));
            }
        } catch (error) {
            console.error('Error loading container type children:', error);
        }

        return children;
    }
}
