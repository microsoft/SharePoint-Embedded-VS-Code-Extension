/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class VideosTreeItem extends vscode.TreeItem {
    public constructor() {
        super("Video tutorials",  vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("play-circle");
        this.command = {
            title: "Video tutorials",
            command: "spe.Resources.openVideos"
        };
    }
}