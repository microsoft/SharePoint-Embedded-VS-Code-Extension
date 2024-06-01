/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export abstract class IChildrenProvidingTreeItem extends vscode.TreeItem {
    public abstract getChildren(): Thenable<vscode.TreeItem[]>;
}