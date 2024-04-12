/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTypesTreeItem } from "./ContainerTypesTreeItem";
import { Account } from "../../../models/Account";
import { ContainerType } from "../../../models/ContainerType";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<ContainerTypesTreeItem | vscode.TreeItem> {
    private static instance: DevelopmentTreeViewProvider;
    public static readonly viewId = "spe-development";
    private _onDidChangeTreeData: vscode.EventEmitter<ContainerTypesTreeItem | undefined | void> =
        new vscode.EventEmitter<ContainerTypesTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ContainerTypesTreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

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

    public getChildren(element?: ContainerTypesTreeItem | vscode.TreeItem): Thenable<(ContainerTypesTreeItem | vscode.TreeItem)[]> {
        if (element) {
            // @ts-ignore
            return Promise.resolve(element.getChildren());
        } else {
            return Promise.resolve(this._getDevelopmentTreeViewChildren());
        }
    }

    private _getDevelopmentTreeViewChildren(): (ContainerTypesTreeItem | vscode.TreeItem)[]{
        const account = Account.get();

        if (!account) {
            return [];
        }

        const isContainerTypeCreating = Account.getContainerTypeCreationState();
        const containerTypes: ContainerType[] = Account.get()!.containerTypes;

        if (isContainerTypeCreating) {
            const containerTypeCreatingButton = new vscode.TreeItem("Creating Container Type...", vscode.TreeItemCollapsibleState.None);
            containerTypeCreatingButton.iconPath = new vscode.ThemeIcon("loading~spin");
            return [containerTypeCreatingButton];
        } else if (!isContainerTypeCreating && containerTypes && containerTypes.length > 0) {
            return [new ContainerTypesTreeItem()];
        }

        return [];
    }

}