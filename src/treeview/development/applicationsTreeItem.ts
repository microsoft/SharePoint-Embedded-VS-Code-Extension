/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ApplicationTreeItem } from "./applicationTreeItem";
import { ContainerTreeItem } from "./containerTreeItem";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ext } from "../../utils/extensionVariables";
import ThirdPartyAuthProvider from "../../services/3PAuthProvider";
import { ApplicationPermissions } from "../../utils/models";
import { TreeViewCommand } from "./treeViewCommand";

export class ApplicationsTreeItem extends vscode.TreeItem {
    private appsItem?: ApplicationTreeItem[];
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public readonly containerTypeId: string,
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
        const appPermissionsDict: { [key: string]: ApplicationPermissions[] } = this.createAppServiceProvider.globalStorageManager.getValue("AppPermissions");
        const appDict: { [key: string]: any } = this.createAppServiceProvider.globalStorageManager.getValue("3PAppList") 
        const appItems = appPermissionsDict[this.containerTypeId].map(
            (app) => {
                return new ApplicationTreeItem(appDict[app.appId].displayName, vscode.TreeItemCollapsibleState.None, { name: "console", custom: false })
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