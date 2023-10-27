/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"

import { TreeViewCommand } from "./treeViewCommand";
import { ext } from "../../utils/extensionVariables";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ContainerTypeTreeItem } from "./containerTypeTreeItem";
import { ContainerTypeListKey, OwningAppIdsListKey, ThirdPartyAppListKey } from "../../utils/constants";
import { OwningApplicationsTreeItem } from "./owningApplicationsTreeItem";

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
            // @ts-ignore
            return Promise.resolve(element.getChildren());
        } else {
            return Promise.resolve(this.commands);
        }
    }

    private getDevelopmentTreeViewChildren(): (TreeViewCommand | ContainerTypeTreeItem)[] {
        // Fetch apps and CT List from storage
        const owningAppsTreeItem = new OwningApplicationsTreeItem(
            `Azure AD Apps`,
            vscode.TreeItemCollapsibleState.Collapsed,
            { name: "symbol-function", custom: false }
        )

        const treeViewCommands: any = [owningAppsTreeItem]


        return treeViewCommands;
    }

}