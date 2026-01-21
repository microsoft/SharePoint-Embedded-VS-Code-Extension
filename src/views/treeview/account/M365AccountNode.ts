/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../DynamicNode";
import { m365Icon } from "./common";
import { AuthenticationState, AuthStateChangeListener, AuthenticatedAccount } from "../../../services/AuthenticationState";
import { AccountTreeViewProvider } from "./AccountTreeViewProvider";
import { DevelopmentTreeViewProvider } from "../development/DevelopmentTreeViewProvider";

export class M365AccountNode extends DynamicNode implements AuthStateChangeListener {
  private static readonly _signingInLabel = "Signing into your account...";

  constructor(private _eventEmitter: vscode.EventEmitter<DynamicNode | undefined | void>) {
    super(M365AccountNode._signingInLabel);
    AuthenticationState.subscribe(this);
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    this.contextValue = "signingInM365";
    this._initializeState();
  }

  private async _initializeState(): Promise<void> {
    const isSignedIn = await AuthenticationState.isSignedIn();
    if (isSignedIn) {
      const account = await AuthenticationState.getCurrentAccount();
      if (account) {
        this.onSignIn(account);
      }
    }
  }

  public onBeforeSignIn(): void {
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
    AccountTreeViewProvider.getInstance().refresh();
  }

  public onSignIn(account: AuthenticatedAccount): void {
    this.label = account.name || account.username;
    this.iconPath = m365Icon;
    this.contextValue = "signedinM365";
    vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
    vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', true);
    vscode.commands.executeCommand('setContext', 'spe:isAdmin', account.isAdmin);
    AccountTreeViewProvider.getInstance().refresh();
    DevelopmentTreeViewProvider.getInstance().refresh();
  }

  public onSignInFailed(): void {
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
    DevelopmentTreeViewProvider.getInstance().refresh();
    AccountTreeViewProvider.getInstance().refresh();
  }

  public onSignOut(): void {
    DevelopmentTreeViewProvider.getInstance().refresh();
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
    vscode.commands.executeCommand('setContext', 'spe:isAdmin', false);
    AccountTreeViewProvider.getInstance().refresh();
  }

  public getChildren(): vscode.ProviderResult<DynamicNode[]> {
    return [this];
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    return this;
  }

  dispose(): void {
    AuthenticationState.unsubscribe(this);
  }
}