/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"

import { TreeViewCommand } from "./treeViewCommand";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<TreeViewCommand> {
    private static instance: DevelopmentTreeViewProvider;
    private _onDidChangeTreeData: vscode.EventEmitter<TreeViewCommand | undefined | void> =
        new vscode.EventEmitter<TreeViewCommand | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeViewCommand | undefined | void> =
        this._onDidChangeTreeData.event;

    private commands: TreeViewCommand[] = [];

    public constructor() {
        this.commands = this.getDevelopmentCommands();
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

    public getTreeItem(element: TreeViewCommand): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: TreeViewCommand): Thenable<TreeViewCommand[]> {
        if (element && element.children) {
            return Promise.resolve(element.children);
        } else {
            return Promise.resolve(this.commands);
        }
    }

    private getDevelopmentCommands(): TreeViewCommand[] {
        return [
            new TreeViewCommand(
                "Create a New App",
                "Create a new app from scratch or start from a sample app",
                "spe.createNewApp",
                "createProject",
                { name: "new-folder", custom: false }
            )
        ]
    }

}