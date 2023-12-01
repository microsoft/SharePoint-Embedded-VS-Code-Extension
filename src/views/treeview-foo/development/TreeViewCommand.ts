/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class TreeViewCommand extends vscode.TreeItem {
  public children?: TreeViewCommand[];

  constructor(
    private _readyLabel: string,
    private _readyTooltip: string | vscode.MarkdownString,
    public commandId?: string,
    public commandArguments?: any[],
    public image?: { name: string; custom: boolean }
  ) {
    super(_readyLabel, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this._readyTooltip;
    this._setImagetoIcon();

    if (commandId) {
      this.command = {
        title: _readyLabel,
        command: commandId,
        arguments: commandArguments
      };
      this.contextValue = commandId;
    }
  }

  private _setImagetoIcon() {
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