/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"


import { ContainerTypesTreeItem } from "./containerTypesTreeItem";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<ContainerTypesTreeItem> {
    private static instance: DevelopmentTreeViewProvider;
    private _onDidChangeTreeData: vscode.EventEmitter< ContainerTypesTreeItem | undefined | void> =
        new vscode.EventEmitter<ContainerTypesTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ContainerTypesTreeItem| undefined | void> =
        this._onDidChangeTreeData.event;

    private commands: ContainerTypesTreeItem

    public constructor() {
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

    public getChildren(element?: ContainerTypesTreeItem): Thenable<ContainerTypesTreeItem[]> {
        if (element) {
            // @ts-ignore
            return Promise.resolve(element.getChildren());
        } else {
            return Promise.resolve([this.commands]);
        }
    }

    private getDevelopmentTreeViewChildren(): ContainerTypesTreeItem {
        // Fetch apps and CT List from storage
        const containerTypesTreeItem = new ContainerTypesTreeItem(
            `Container Types`,
            vscode.TreeItemCollapsibleState.Collapsed,
            { name: "symbol-function", custom: false }
        )
        return containerTypesTreeItem;
    }

}