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

export class ContainerTypeTreeItem extends vscode.TreeItem {
    private appsItem?: ApplicationTreeItem[];
    private containersListItem: ContainerTreeItem[] | undefined;
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
    }

    public async getChildren() {
        const createAppButton = new TreeViewCommand(
            "Load Existing AAD App",
            "Load an existing AAD Application ID",
            "spe.stub",
            undefined,
            { name: "globe", custom: false }
        );

        const applicationsTreeItem = new ApplicationsTreeItem(this.containerTypeId, "Applications", vscode.TreeItemCollapsibleState.Collapsed);
        const containersTreeItem = new ContainersTreeItem("Containers", vscode.TreeItemCollapsibleState.Collapsed);

        return [createAppButton, applicationsTreeItem, containersTreeItem];
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