/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../dynamicNode";
import { AccountItemStatus, m365Icon, signOutIcon } from "./common";
import { Account, LoginChangeListener } from "../../models/Account";

export class M365AccountNode extends DynamicNode implements LoginChangeListener {

  constructor(private _eventEmitter: vscode.EventEmitter<DynamicNode | undefined | void>) {
    super("Logging into account...");
    Account.subscribeLoginListener(this);
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
  }

  public onLogin(account: Account): void {
    this.label = account.username;
    this.iconPath = m365Icon;
    this.contextValue = "signedinM365";
    vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', account.isAdmin);
    this._eventEmitter.fire(this);
  }

  public onLogout(): void {
    this.label = "Logging into account...";
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "";
    vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', false);
    this._eventEmitter.fire(this);
  }

  public getChildren(): vscode.ProviderResult<DynamicNode[]> {
    return [this];
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    return this;
  }
}