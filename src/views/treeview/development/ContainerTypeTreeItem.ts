/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { OwningAppTreeItem } from "./OwningAppTreeItem";
import { ContainerType } from "../../../models/schemas";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
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
            
            // TODO: Add local registration check when we have the registration service
            // This would require calling the registration service to check if the container type
            // is registered in the current tenant
            
        } catch (error) {
            console.error('Error loading container type children:', error);
        }

        return children;
    }
}
