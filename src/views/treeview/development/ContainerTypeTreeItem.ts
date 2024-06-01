/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { OwningAppTreeItem } from "./OwningAppTreeItem";
import { ContainerType } from "../../../models/ContainerType";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";

export class ContainerTypeTreeItem extends IChildrenProvidingTreeItem {

    constructor(public readonly containerType: ContainerType) {
        super(containerType.displayName, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        this.contextValue = "spe:containerTypeTreeItem";
        if (containerType.isTrial) {
            let expirationString = '';
            const daysLeft = containerType.trialDaysLeft;
            if (daysLeft !== undefined) {
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
        containerType.loadLocalRegistration()
            .then((registration) => {
                if (!registration || !registration.applications.includes(containerType.owningAppId)) {
                    throw new Error();
                }
                this.contextValue += "-registered";
            })
            .catch((error) => {
                this.contextValue += "-unregistered";
            })
            .finally(() => {
                DevelopmentTreeViewProvider.instance.refresh(this);
            });
    }
    
    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children = [];
        
        let owningApp;
        try {
            owningApp = await this.containerType.loadOwningApp();
            if (!owningApp) {
                throw new Error('Owning app not found');
            }
            children.push(new OwningAppTreeItem(this.containerType, this));
        } catch (error) {
            return children;
        }
        
        try {
            const localRegistration = await this.containerType.loadLocalRegistration();
            if (localRegistration && localRegistration.applications.includes(owningApp.clientId)) {
                children.push(new LocalRegistrationTreeItem(this.containerType));
            }
        } catch (error) {
        }

        return children;
    }
}
