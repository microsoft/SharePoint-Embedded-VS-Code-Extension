/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../DynamicNode";
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
    try {
      const result = await Promise.race([
        AuthenticationState.isSignedIn(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Init check timed out')), 10_000)
        )
      ]);
      if (result) {
        const account = await AuthenticationState.getCurrentAccount();
        if (account) {
          this.onSignIn(account);
          return;
        }
      }
    } catch (error) {
      console.error('[M365AccountNode] _initializeState failed:', error);
    }
    // Not signed in or timed out — notify failure to reset UI
    this.onSignInFailed();
  }

  public onBeforeSignIn(): void {
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
    AccountTreeViewProvider.getInstance().refresh();
  }

  public onSignIn(account: AuthenticatedAccount): void {
    this.label = account.username;
    this.iconPath = new vscode.ThemeIcon('accounts-view-bar-icon');
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
    vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
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