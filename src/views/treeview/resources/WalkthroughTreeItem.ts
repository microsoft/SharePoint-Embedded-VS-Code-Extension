/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class WalkthroughTreeItem extends vscode.TreeItem {
    public constructor() {
        super("Get started with SharePoint Embedded",  vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("spe-logo");
        this.command = {
            title: "Open Walkthrough",
            command: "workbench.action.openWalkthrough",
            arguments: ["SharepointEmbedded.ms-sharepoint-embedded-vscode-extension#spe.gettingStarted"]
        };
    }
}