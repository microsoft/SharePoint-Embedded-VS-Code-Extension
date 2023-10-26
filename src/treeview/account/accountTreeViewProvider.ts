/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../dynamicNode";
import { M365AccountNode } from "./m365Node";
// @ts-ignore
import { AccountInfo } from "@azure/msal-node";

export class AccountTreeViewProvider implements vscode.TreeDataProvider<DynamicNode> {
    private static instance: AccountTreeViewProvider;
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
    public getTreeItem(element: DynamicNode): vscode.TreeItem | Promise<vscode.TreeItem> {
        return element.getTreeItem();
    }
    public getChildren(element?: any): Thenable<DynamicNode[]> {
        if (!element) {
            const nodes = this.getAccountNodes();
            return Promise.resolve(nodes);
        }
        return element.getChildren();
    }

    private getAccountNodes(): DynamicNode[] {
        return [this.m365AccountNode];
    }
}

export async function m365AccountStatusChangeHandler(
    status: string,
    accountInfo?: AccountInfo | null
) {
    const instance = AccountTreeViewProvider.getInstance();
    if (status === "SignedIn") {
        if (accountInfo) {
            instance.m365AccountNode.setSignedIn(
                (accountInfo.username as string) ? (accountInfo.username as string) : ""
            );
        }
    } else if (status === "SignedOut") {
        instance.m365AccountNode.setSignedOut();
    }
    return Promise.resolve();
}


export default AccountTreeViewProvider.getInstance();