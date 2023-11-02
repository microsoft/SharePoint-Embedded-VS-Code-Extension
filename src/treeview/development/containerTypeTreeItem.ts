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
import { TreeViewCommand } from "./treeViewCommand";
import { ApplicationsTreeItem } from "./applicationsTreeItem";
import { ContainersTreeItem } from "./containersTreeItem";
import { RegisteredContainerTypeSetKey } from "../../utils/constants";

export class ContainerTypeTreeItem extends vscode.TreeItem {
    private appsItem?: ApplicationTreeItem[];
    private containersListItem: ContainerTreeItem[] | undefined;
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public appId: string,
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
        const registeredContainerTypes: any = this.createAppServiceProvider.globalStorageManager.getValue(RegisteredContainerTypeSetKey) || [];
        const registerCTSet = new Set(registeredContainerTypes);
        
        if (registerCTSet.has(this.containerTypeId)) {
            const newGuestAdAppButton = new TreeViewCommand(
                "Create new Guest AD App",
                "",
                "spe.createGuestAdApp",
                [this.appId, undefined],
                { name: "new-folder", custom: false }
            );
            const applicationsTreeItem = new ApplicationsTreeItem(this.containerTypeId, "Guest AD Apps", vscode.TreeItemCollapsibleState.Collapsed);

            return [newGuestAdAppButton, applicationsTreeItem];

        } else {
            const registerContainerTypeButton = new TreeViewCommand(
                "Register Container Type",
                "Register this Container Type",
                "spe.registerNewContainerTypeCommand",
                [this.appId, undefined],
                { name: "globe", custom: false }
            );
            
            return [registerContainerTypeButton];
        }

        //const containersTreeItem = new ContainersTreeItem("Containers", vscode.TreeItemCollapsibleState.Collapsed);
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