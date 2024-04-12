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
        public readonly containerType: ContainerType
    ) {
        super(containerType.displayName, vscode.TreeItemCollapsibleState.Collapsed);
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
        const children = [];
        const owningApp = await this.containerType.owningApp;
        if (owningApp) {
            children.push(new OwningApplicationTreeItem(
                owningApp,
                this.containerType,
                owningApp.displayName || owningApp.clientId,
                vscode.TreeItemCollapsibleState.None
            ));
        }
        const registration = await this.containerType.localRegistration;
        if (registration) {
            children.push(new GuestApplicationsTreeItem(this.containerType));
        }

        //const guestAppsTreeItem = new GuestApplicationsTreeItem(this.containerType, 'Guest Apps', vscode.TreeItemCollapsibleState.Collapsed);
        //const containersTreeItem = new ContainersTreeItem(this.containerType, 'Containers', vscode.TreeItemCollapsibleState.Collapsed);
        return children;
        //return [owningApplicationTreeItem, guestAppsTreeItem, containersTreeItem];
    }
}