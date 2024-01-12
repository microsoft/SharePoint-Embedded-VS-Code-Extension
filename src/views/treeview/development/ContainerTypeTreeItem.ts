/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainersTreeItem } from "./ContainersTreeItem";
import { OwningApplicationTreeItem } from "./OwningApplicationTreeItem";
import { ContainerType } from "../../../models/ContainerType";
import { GuestApplicationsTreeItem } from "./GuestApplicationsTreeItem";

export class ContainerTypeTreeItem extends vscode.TreeItem {
    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,

    ) {
        super(label, collapsibleState);
        if (containerType.containers.length === 0) {
            vscode.commands.executeCommand('setContext', 'spe:showDeleteContainerType', true);
        } else {
            vscode.commands.executeCommand('setContext', 'spe:showDeleteContainerType', false);
        }

        if (containerType.registrationIds.length === 0) {
            vscode.commands.executeCommand('setContext', 'spe:showRegisterContainerType', true);
        } else {
            vscode.commands.executeCommand('setContext', 'spe:showRegisterContainerType', false);
        }
        this.iconPath = new vscode.ThemeIcon("containertype-icon");
        this.contextValue = "containerType";
    }

    public async getChildren() {
        const owningApplicationTreeItem = new OwningApplicationTreeItem(this.containerType.owningApp!, this.containerType, `${this.containerType.owningApp!.displayName}`, vscode.TreeItemCollapsibleState.None);
        const guestAppsTreeItem = new GuestApplicationsTreeItem(this.containerType, 'Guest Apps', vscode.TreeItemCollapsibleState.Collapsed);
        const containersTreeItem = new ContainersTreeItem(this.containerType, 'Containers', vscode.TreeItemCollapsibleState.Collapsed);

        return [owningApplicationTreeItem, guestAppsTreeItem, containersTreeItem];
    }
}