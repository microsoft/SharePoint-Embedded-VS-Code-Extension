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
                if (!registration) {
                    throw new Error();
                }
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
        
        try {
            const owningApp = await this.containerType.loadOwningApp();
            if (!owningApp) {
                throw new Error('Owning app not found');
            }
            children.push(new OwningAppTreeItem(this.containerType));
        } catch (error) {
            console.error(`Unable to load owning app ${error}`);
        }
        
        try {
            const localRegistration = await this.containerType.loadLocalRegistration();
            if (localRegistration) {
                children.push(new LocalRegistrationTreeItem(this.containerType));
            }
        } catch (error) {
            console.error(`Unable to load local registration ${error}`);
        }

        return children;
    }
}
