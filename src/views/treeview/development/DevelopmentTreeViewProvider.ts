/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTypesTreeItem } from "./ContainerTypesTreeItem";
import { AuthenticationState } from "../../../services/AuthenticationState";
import { GraphAuthProvider } from "../../../services/Auth/GraphAuthProvider";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
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
        // Check if user is signed in using the new authentication system
        const isSignedIn = await AuthenticationState.isSignedIn();
        if (!isSignedIn) {
            return [];
        }
        
        try {
            await vscode.commands.executeCommand('setContext', 'spe:showGettingStartedView', false);
            await vscode.commands.executeCommand('setContext', 'spe:showFailedView', false);
            
            // Use GraphAuthProvider to get container types
            const graphAuth = GraphAuthProvider.getInstance();
            const graphProvider = GraphProvider.getInstance();
            const containerTypes = await graphProvider.containerTypes.list();
            
            if (containerTypes && containerTypes.length > 0) {
                return [new ContainerTypesTreeItem(containerTypes)];
            }
            await vscode.commands.executeCommand('setContext', 'spe:showGettingStartedView', true);
        } catch {
            await vscode.commands.executeCommand('setContext', 'spe:showFailedView', true);
        }
        return [];
    }
}
