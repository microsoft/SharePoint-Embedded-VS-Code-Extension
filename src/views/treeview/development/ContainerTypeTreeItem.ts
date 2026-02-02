/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { OwningAppTreeItem } from "./OwningAppTreeItem";
import { ContainerType, ContainerTypeRegistration } from "../../../models/schemas";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";

export class ContainerTypeTreeItem extends IChildrenProvidingTreeItem {
    public readonly registration: ContainerTypeRegistration | null;

    constructor(
        public readonly containerType: ContainerType,
        registration: ContainerTypeRegistration | null = null
    ) {
        super(containerType.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.registration = registration;
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        this.contextValue = "spe:containerTypeTreeItem";

        // Check if it's a trial based on billing classification
        const isTrial = containerType.billingClassification === 'trial';
        if (isTrial) {
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
        } else {
            this.contextValue += "-paid";
        }

        // Check discoverability status
        const isDiscoverabilityEnabled = containerType.settings?.isDiscoverabilityEnabled === true;
        this.contextValue += isDiscoverabilityEnabled ? "-discoverabilityEnabled" : "-discoverabilityDisabled";

        // Set registration status based on passed registration
        this.contextValue += registration ? "-registered" : "-unregistered";
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
