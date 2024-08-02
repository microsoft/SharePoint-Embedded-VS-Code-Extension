/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainersTreeItem } from "./ContainersTreeItem";
import { ContainerType } from "../../../models/ContainerType";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerTypeRegistration } from "../../../models/ContainerTypeRegistration";
import { GuestAppsTreeItem } from "./GuestAppsTreeItem";
import { Account } from "../../../models/Account";
import { RecycledContainersTreeItem } from "./RecycledContainersTreeItem";

export class LocalRegistrationTreeItem extends IChildrenProvidingTreeItem {
    private readonly _registration: ContainerTypeRegistration;
    constructor(private readonly _containerType: ContainerType) {
        super(vscode.l10n.t('Local tenant registration'), vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon("ctregistration-icon");
        this.description = `(${Account.get()!.domain})`;
        this.contextValue = "spe:localRegistrationTreeItem";
        this._registration = _containerType.localRegistration!;
    }
    
    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children = [];
        
        children.push(new GuestAppsTreeItem(this._registration));
        children.push(new ContainersTreeItem(this._registration, this));
        children.push(new RecycledContainersTreeItem(this._registration, this));
        
        return children;
    }
}
