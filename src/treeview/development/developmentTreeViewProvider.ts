/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"

import { TreeViewCommand } from "./treeViewCommand";
import { ext } from "../../utils/extensionVariables";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import ThirdPartyAuthProvider from "../../services/3PAuthProvider";
import { ContainerTypeTreeItem } from "./containerTypeTreeItem";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<TreeViewCommand | ContainerTypeTreeItem> {
    private createAppServiceProvider: CreateAppProvider;
    private static instance: DevelopmentTreeViewProvider;
    private _onDidChangeTreeData: vscode.EventEmitter<TreeViewCommand | ContainerTypeTreeItem | undefined | void> =
        new vscode.EventEmitter<TreeViewCommand | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeViewCommand | ContainerTypeTreeItem| undefined | void> =
        this._onDidChangeTreeData.event;

    private commands: (TreeViewCommand | ContainerTypeTreeItem)[];

    public constructor() {
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);
        this.commands = this.getDevelopmentTreeViewChildren();
    }

    public static getInstance() {
        if (!DevelopmentTreeViewProvider.instance) {
            DevelopmentTreeViewProvider.instance = new DevelopmentTreeViewProvider();
        }
        return DevelopmentTreeViewProvider.instance;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: (any)): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: (TreeViewCommand | ContainerTypeTreeItem)): Thenable<(TreeViewCommand | ContainerTypeTreeItem)[]> {
        if (element) {
            // eslint-disable-next-line
            return Promise.resolve(element.getChildren());
        } else {
            return Promise.resolve(this.commands);
        }
    }

    private getDevelopmentTreeViewChildren(): (TreeViewCommand | ContainerTypeTreeItem)[] {
        // Fetch apps and CT List from storage
        const apps: any = this.createAppServiceProvider.globalStorageManager.getValue("3PAppList");
        const containerTypeList: any = this.createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList");
        
        const createAppButton = new TreeViewCommand(
            "Create a New App",
            "Create a new app from scratch or start from a sample app",
            "spe.createNewApp",
            undefined,
            { name: "new-folder", custom: false }
        );

        const treeViewCommands: any = [createAppButton, ...Object.values(containerTypeList).map((containerType : any) => {

            // const appId = containerType.OwningAppId
            // const secrets = await this.createAppServiceProvider.getSecretsByAppId(appId)
            // const provider = new ThirdPartyAuthProvider(appId, secrets.thumbprint, secrets.privateKey)
            // const token = await provider.getToken(['FileStorageContainer.Selected']);
            // const containers = await this.createAppServiceProvider.graphProvider.listStorageContainers(token, containerType.ContainerTypeId)

            const billingType = containerType.SPContainerTypeBillingClassification === 1 ? "Trial" : "Standard";

            return new ContainerTypeTreeItem(
                `${containerType.ContainerTypeId}`,
                `${billingType} - ${containerType.DisplayName}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                { name: "symbol-function", custom: false }
            );
        })];

        return treeViewCommands;
    }

}