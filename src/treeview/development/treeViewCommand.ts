/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class TreeViewCommand extends vscode.TreeItem {
    public children?: TreeViewCommand[];

    constructor(
        private readyLabel: string,
        private readyTooltip: string | vscode.MarkdownString,
        public commandId?: string,
        public runningLabelKey?: string,
        public image?: { name: string; custom: boolean }
      ) {
        super(readyLabel, vscode.TreeItemCollapsibleState.None);
    
        this.tooltip = this.readyTooltip;
        this.setImagetoIcon();
    
        if (commandId) {
          this.command = {
            title: readyLabel,
            command: commandId
          };
          this.contextValue = commandId;
        }
      }

    private setImagetoIcon() {
        if (this.image !== undefined) {
          if (!this.image.custom) {
            this.iconPath = new vscode.ThemeIcon(
              this.image.name,
              new vscode.ThemeColor("icon.foreground")
            );
          }
        }
      }
}