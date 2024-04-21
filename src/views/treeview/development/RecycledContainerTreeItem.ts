/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Container } from "../../../models/Container";

export class RecycledContainerTreeItem extends vscode.TreeItem {
    constructor(container: Container) {
        super(container.displayName, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("container-icon");
        this.contextValue = "spe:recycledContainerTreeItem";
    }

}