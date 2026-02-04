/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";

export class NonAdminInfoTreeItem extends IChildrenProvidingTreeItem {
    private static readonly label = vscode.l10n.t("Administrative access required");
    
    constructor() {
        super(NonAdminInfoTreeItem.label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("warning");
        this.description = vscode.l10n.t("Sign in as an admin to manage Container Types");
        this.tooltip = vscode.l10n.t("To manage Container Types, you need administrator access to your Microsoft 365 tenant.");
        this.contextValue = "spe:nonAdminInfo";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        return [];
    }
}
