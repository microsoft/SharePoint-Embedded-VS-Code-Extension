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
import { ApplicationsTreeItem } from "./applicationsTreeItem";
import { ContainersTreeItem } from "./containersTreeItem";
import { ContainerTypeListKey, OwningAppIdsListKey, ThirdPartyAppListKey } from "../../utils/constants";
import { OwningApplicationTreeItem } from "./owningApplicationTreeItem";

export class OwningApplicationsTreeItem extends vscode.TreeItem {
    private appsItem?: ApplicationTreeItem[];
    private containersListItem: ContainerTreeItem[] | undefined;
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean },
        public commandArguments?: any[]
    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);
    }

    public async getChildren() {
        const owningApps: [] = this.createAppServiceProvider.globalStorageManager.getValue(OwningAppIdsListKey) || [];
        const apps: any = this.createAppServiceProvider.globalStorageManager.getValue(ThirdPartyAppListKey);
        const containerTypeList: any = this.createAppServiceProvider.globalStorageManager.getValue(ContainerTypeListKey) || {};

        const createAppButton = new TreeViewCommand(
            "Create a new Azure AD App",
            "Create a new owning Azure AD App",
            "spe.createNewAadApp",
            [true],
            { name: "new-folder", custom: false }
        );

        const owningApplications: any = [...owningApps.map(id => {
            return new OwningApplicationTreeItem(
                id,
                `${apps[id].displayName}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                { name: "symbol-function", custom: false },

            );
        })]

        if (owningApplications.length === 0) return [createAppButton];
        return [createAppButton, ...owningApplications];
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