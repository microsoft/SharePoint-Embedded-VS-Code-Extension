/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"


import { ContainerTypesTreeItem } from "./containerTypesTreeItem";
import { Account } from "../../models/Account";
import { ContainerType } from "../../models/ContainerType";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<ContainerTypesTreeItem> {
    private static instance: DevelopmentTreeViewProvider;
    private _onDidChangeTreeData: vscode.EventEmitter< ContainerTypesTreeItem | undefined | void> =
        new vscode.EventEmitter<ContainerTypesTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ContainerTypesTreeItem| undefined | void> =
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

    public getChildren(element?: ContainerTypesTreeItem): Thenable<ContainerTypesTreeItem[]> {
        if (element) {
            // @ts-ignore
            return Promise.resolve(element.getChildren());
        } else {
            return Promise.resolve(this.getDevelopmentTreeViewChildren());
        }
    }

    private getDevelopmentTreeViewChildren(): ContainerTypesTreeItem[] {
        const account = Account.get();

        if (!account)
            return [];

        const containerTypes: ContainerType[] = Account.get()!.containerTypes;

        if (containerTypes && containerTypes.length > 0) {
            const containerTypesTreeItem = new ContainerTypesTreeItem(
                `Container Types`,
                vscode.TreeItemCollapsibleState.Expanded
            )
            return [containerTypesTreeItem];
        }

        return [];
    }

}