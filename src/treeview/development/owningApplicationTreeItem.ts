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
import { ContainerTypeListKey, OwningAppIdsListKey, RegisteredContainerTypeSetKey, ThirdPartyAppListKey } from "../../utils/constants";
import { ContainerTypeTreeItem } from "./containerTypeTreeItem";
import { OwningApplicationsTreeItem } from "./owningApplicationsTreeItem";
import { ContainerType } from "../../models/ContainerType";

export class OwningApplicationTreeItem extends vscode.TreeItem {
    private appsItem?: ApplicationTreeItem[];
    private containersListItem: ContainerTreeItem[] | undefined;
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public appId: string,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean },
        public commandArguments?: any[],
    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);
    }

    public async getChildren() {
        const containerTypeList: any = ContainerType.loadAllContainerTypesFromStorage();
        const registeredContainerTypes: any = ContainerType.loadRegisteredContainerTypesFromStorage();
        const registerCTSet = new Set(registeredContainerTypes);

        if (Object.keys(containerTypeList).length == 0) {
            const createContainerTypeButton = new TreeViewCommand(
                "Create new Container Type",
                "Create new Container Type on this application",
                "spe.createNewContainerTypeCommand",
                undefined,
                { name: "symbol-property", custom: false }
            );
            return [createContainerTypeButton];
        } else {

            const containerType = containerTypeList[this.appId]
            const billingType = containerType.SPContainerTypeBillingClassification === 1 ? "Trial" : "Standard";
            const containerTypeItem = new ContainerTypeTreeItem(
                this.appId,
                `${containerType.ContainerTypeId}`,
                `${billingType} - ${containerType.DisplayName}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                { name: "zap", custom: false }
            );

            if (!registerCTSet.has(containerType.ContainerTypeId)) {
                return [containerTypeItem];
            }

            const createPostmanEnvButton = new TreeViewCommand(
                "Export Postman Config",
                "Create a Postman config based on the application details",
                "spe.exportPostmanConfig",
                [this.appId, containerType.ContainerTypeId],
                { name: "symbol-property", custom: false }
            );
    
            const loadSampleAppButton = new TreeViewCommand(
                "Load Sample App",
                "Clone sample app template",
                "spe.cloneRepo",
                [this.appId, containerType.ContainerTypeId],
                { name: "symbol-package", custom: false }
            );

            return [createPostmanEnvButton, loadSampleAppButton, containerTypeItem];
        }
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