/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { SecondaryApplicationTreeItem } from "./secondaryApplicationTreeItem";
import { ContainerTreeItem } from "./containerTreeItem";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ext } from "../../utils/extensionVariables";
import ThirdPartyAuthProvider from "../../services/3PAuthProvider";
import { ApplicationPermissions } from "../../utils/models";
import { TreeViewCommand } from "./treeViewCommand";
import { AppPermissionsListKey, OwningAppIdsListKey, ThirdPartyAppListKey } from "../../utils/constants";
import { ContainerType } from "../../models/ContainerType";

export class SecondaryApplicationsTreeItem extends vscode.TreeItem {
    private appsItem?: SecondaryApplicationTreeItem[];
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);
        this.appsItem = []
    }

    public async getChildren() {
        this.appsItem = this.getApps();
        return this.appsItem;
    }

    private getApps() {
        const appItems = this.containerType.secondaryApps.map(
            (app) => {
                return new SecondaryApplicationTreeItem(app, this.containerType ,app.displayName, vscode.TreeItemCollapsibleState.Collapsed, { name: "console", custom: false })
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