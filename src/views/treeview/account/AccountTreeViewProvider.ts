/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../DynamicNode";
import { M365AccountNode } from "./M365AccountNode";

export class AccountTreeViewProvider implements vscode.TreeDataProvider<DynamicNode> {
    private static instance: AccountTreeViewProvider;
    public static readonly viewId = "spe-accounts";
    
    private _onDidChangeTreeData: vscode.EventEmitter<DynamicNode | undefined | void> = new vscode.EventEmitter<DynamicNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DynamicNode | undefined | void> = this._onDidChangeTreeData.event;

    public m365AccountNode = new M365AccountNode(this._onDidChangeTreeData);

    private constructor() { }

    public static getInstance() {
        if (!AccountTreeViewProvider.instance) {
            AccountTreeViewProvider.instance = new AccountTreeViewProvider();
        }
        return AccountTreeViewProvider.instance;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    public getTreeItem(element: DynamicNode): vscode.TreeItem | Promise<vscode.TreeItem> {
        return element.getTreeItem();
    }
    public getChildren(element?: any): Thenable<DynamicNode[]> {
        if (!element) {
            const nodes = this._getAccountNodes();
            return Promise.resolve(nodes);
        }
        return element.getChildren();
    }

    private _getAccountNodes(): DynamicNode[] {
        return [this.m365AccountNode];
    }
}

//export AccountTreeViewProvider.getInstance();