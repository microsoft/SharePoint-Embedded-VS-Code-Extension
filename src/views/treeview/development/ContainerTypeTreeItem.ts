/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { OwningAppTreeItem } from "./OwningAppTreeItem";
import { ContainerType } from "../../../models/schemas";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
// import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem"; // TODO: Fix this after updating LocalRegistrationTreeItem

export class ContainerTypeTreeItem extends IChildrenProvidingTreeItem {

    constructor(public readonly containerType: ContainerType) {
        super(containerType.name, vscode.TreeItemCollapsibleState.Collapsed);
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
        
        // Note: Registration status check would require additional API calls
        // For now, we'll assume unregistered and update async if needed
        this.contextValue += "-unregistered";
    }
    
    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children = [];
        
        try {
            // Add owning app tree item
            children.push(new OwningAppTreeItem(this.containerType, this));

            // Check if container type is registered
            try {
                const graphProvider = GraphProvider.getInstance();
                const isRegistered = await graphProvider.registrations.isRegistered(this.containerType.id);

                if (isRegistered) {
                    const registration = await graphProvider.registrations.get(this.containerType.id);
                    if (registration) {
                        // Update context value for menu visibility
                        if (this.contextValue) {
                            this.contextValue = this.contextValue.replace('-unregistered', '-registered');
                        }

                        // TODO: Add LocalRegistrationTreeItem when it's updated for new schema
                        // For now, just update the context value so menus work correctly
                        // children.push(new LocalRegistrationTreeItem(this.containerType, registration));
                    }
                }
            } catch (error) {
                console.error('Failed to check registration status:', error);
            }

        } catch (error) {
            console.error('Error loading container type children:', error);
        }

        return children;
    }
}
