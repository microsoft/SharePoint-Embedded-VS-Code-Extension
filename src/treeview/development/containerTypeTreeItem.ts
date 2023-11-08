/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainersTreeItem } from "./containersTreeItem";
import { OwningApplicationTreeItem } from "./owningApplicationTreeItem";
import { ContainerType } from "../../models/ContainerType";
import { SecondaryApplicationsTreeItem } from "./secondaryApplicationsTreeItem";

export class ContainerTypeTreeItem extends vscode.TreeItem {
    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState);
        if (containerType.containers.length === 0) {
            vscode.commands.executeCommand('setContext', 'spe:showDeleteContainerType', true);
        }

        if (containerType.registrationIds.length === 0) {
            vscode.commands.executeCommand('setContext', 'spe:showRegisterContainerType', true);
        }
        //this.tooltip = containerType.d
        this.setImagetoIcon();
        this.contextValue = "containerType";
    }

    public async getChildren() {
        const owningApplicationTreeItem = new OwningApplicationTreeItem(this.containerType.owningApp!, this.containerType, `${this.containerType.owningApp!.displayName}`, vscode.TreeItemCollapsibleState.None, { name: "extensions-star-full", custom: false });
        const secondaryAppsTreeItem = new SecondaryApplicationsTreeItem(this.containerType, 'Secondary Apps', vscode.TreeItemCollapsibleState.Collapsed);
        const containersTreeItem = new ContainersTreeItem(this.containerType, 'Containers', vscode.TreeItemCollapsibleState.Collapsed);

        return [owningApplicationTreeItem, secondaryAppsTreeItem, containersTreeItem];
    }

    private setImagetoIcon() {
        if (this.image !== undefined) {
            if (!this.image.custom) {
                this.iconPath = new vscode.ThemeIcon(
                    this.image.name,
                    new vscode.ThemeColor("icon.foreground")
                );
            }
        }
    }

}