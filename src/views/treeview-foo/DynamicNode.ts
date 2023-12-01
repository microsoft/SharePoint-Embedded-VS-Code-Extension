/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export abstract class DynamicNode extends vscode.TreeItem {
  public abstract getChildren(): vscode.ProviderResult<DynamicNode[]>;
  public abstract getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem>;
}
