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
        if (containerType.isTrial) {
            this.description = "(trial)";
        }
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        this.contextValue = "spe:containerTypeTreeItem";

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
        
        if (this.containerType.localRegistration) {
            children.push(new LocalRegistrationTreeItem(this.containerType));
        }

        return children;
    }
}
