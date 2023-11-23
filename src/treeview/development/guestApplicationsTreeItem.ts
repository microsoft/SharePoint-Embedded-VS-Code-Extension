/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./guestApplicationTreeItem";
import { ContainerType } from "../../models/ContainerType";

export class GuestApplicationsTreeItem extends vscode.TreeItem {
    private appsItem?: GuestApplicationTreeItem[];

    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState);
        this.contextValue = "guestApplications";
        this.setImagetoIcon();
        this.appsItem = [];
    }

    public async getChildren() {
        this.appsItem = this.getApps();
        return this.appsItem;
    }

    private getApps() {
        const appItems = this.containerType.guestApps.map(
            (app) => {
                return new GuestApplicationTreeItem(app, this.containerType, app.displayName, vscode.TreeItemCollapsibleState.None, { name: "console", custom: false })
            }
        )
        return appItems;
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