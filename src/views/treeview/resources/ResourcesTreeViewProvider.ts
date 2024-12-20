/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { WalkthroughTreeItem } from "./WalkthroughTreeItem";
import { DocumentationTreeItem } from "./DocumentationTreeItem";
import { VideosTreeItem } from "./VideosTreeItem";
import { DevCommunityTreeItem } from "./DevCommunityTreeItem";

export class ResourcesTreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    
    public static readonly viewId = "spe-resources";
    private readonly _children: vscode.TreeItem[] = [];

    public static readonly instance: ResourcesTreeViewProvider = new ResourcesTreeViewProvider();
    private constructor() { 
        this._children.push(new WalkthroughTreeItem());
        this._children.push(new DocumentationTreeItem());
        this._children.push(new VideosTreeItem());
        this._children.push(new DevCommunityTreeItem());
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    public getChildren(element?: vscode.TreeItem | undefined): vscode.ProviderResult<vscode.TreeItem[]> {
        return this._children;
    }



}
