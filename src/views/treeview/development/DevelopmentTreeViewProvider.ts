/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTypesTreeItem } from "./ContainerTypesTreeItem";
import { Account } from "../../../models/Account";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<IChildrenProvidingTreeItem | vscode.TreeItem> {
    
    public static readonly viewId = "spe-development";
    
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    private constructor() { }
    public static readonly instance: DevelopmentTreeViewProvider = new DevelopmentTreeViewProvider();
    public static getInstance() {
        return DevelopmentTreeViewProvider.instance;
    }

    public refresh(element?: vscode.TreeItem): void {
        if (element && element instanceof ContainerTypesTreeItem) {
            element = undefined;
        }
        this._onDidChangeTreeData.fire(element);
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: IChildrenProvidingTreeItem | vscode.TreeItem | undefined): Promise<vscode.TreeItem[]> {
        if (element) {
            if (element instanceof IChildrenProvidingTreeItem) {
                return await element.getChildren();
            } else {
                return Promise.resolve([]);
            }
        }
        return await this._getChildren();
    }

    private async _getChildren(): Promise<vscode.TreeItem[]> {
        const account = Account.get();
        if (!account) {
            return [];
        }
        
        try {
            await vscode.commands.executeCommand('setContext', 'spe:showGettingStartedView', false);
            await vscode.commands.executeCommand('setContext', 'spe:showFailedView', false);
            await account.loadContainerTypes();
            if (account.containerTypes && account.containerTypes.length > 0) {
                return [new ContainerTypesTreeItem(account)];
            }
            await vscode.commands.executeCommand('setContext', 'spe:showGettingStarted', true);
        } catch {
            await vscode.commands.executeCommand('setContext', 'spe:showFailedView', true);
        }
        return [];
    }
}
