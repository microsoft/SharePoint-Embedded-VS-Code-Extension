/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../dynamicNode";
import { AccountItemStatus, m365Icon, signOutIcon } from "./common";
import { Account, AccountChangeListener } from "../../models/Account";

export class M365AccountNode extends DynamicNode implements AccountChangeListener {

  constructor(private eventEmitter: vscode.EventEmitter<DynamicNode | undefined | void>) {
    super("Sign in to Microsoft 365");
    Account.subscribe(this);
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    this.command = {
      command: 'spe.login',
      title: 'Sign in to Microsoft 365'
    };
    this.iconPath = m365Icon;
  }

  public onLogin(account: Account): void {
    this.label = account.username;
    this.contextValue = "signedinM365";
    vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', account.isAdmin);
    this.eventEmitter.fire(this);
  }

  public onLogout(): void {
    this.label = "Login to M365";
    this.contextValue = "signinM365";
    vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', false);
    this.eventEmitter.fire(this);
  }

  public getChildren(): vscode.ProviderResult<DynamicNode[]> {
    return [this];
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    return this;
  }
}