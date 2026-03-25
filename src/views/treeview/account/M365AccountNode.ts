/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../DynamicNode";
import { AuthenticationState, AuthStateChangeListener, AuthenticatedAccount } from "../../../services/AuthenticationState";
import { AccountTreeViewProvider } from "./AccountTreeViewProvider";

export class M365AccountNode extends DynamicNode implements AuthStateChangeListener {
  private static readonly _signingInLabel = "Signing into your account...";
  private static readonly _loadingLabel = "Loading your data...";
  private _pendingAccount: AuthenticatedAccount | undefined;

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
          // During init, show the username immediately (tree view
          // is already being loaded by AuthenticationState.initialize)
          this._showSignedIn(account);
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
    this._pendingAccount = undefined;
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    AccountTreeViewProvider.getInstance().refresh();
  }

  public onSignIn(account: AuthenticatedAccount): void {
    // Don't show the username yet — keep the spinner with a loading message
    // until the dev tree is ready. extension.ts calls showReady() after tree loads.
    this._pendingAccount = account;
    this.label = M365AccountNode._loadingLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    AccountTreeViewProvider.getInstance().refresh();
  }

  /**
   * Called by extension.ts after the dev tree has finished loading.
   * Transitions from the loading spinner to showing the username.
   */
  public showReady(): void {
    if (this._pendingAccount) {
      this._showSignedIn(this._pendingAccount);
      this._pendingAccount = undefined;
    }
  }

  public onSignInFailed(): void {
    this._pendingAccount = undefined;
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    AccountTreeViewProvider.getInstance().refresh();
  }

  public onSignOut(): void {
    this._pendingAccount = undefined;
    this.label = M365AccountNode._signingInLabel;
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.contextValue = "signingInM365";
    AccountTreeViewProvider.getInstance().refresh();
  }

  public getChildren(): vscode.ProviderResult<DynamicNode[]> {
    return [this];
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    return this;
  }

  private _showSignedIn(account: AuthenticatedAccount): void {
    this.label = account.username;
    this.iconPath = new vscode.ThemeIcon('accounts-view-bar-icon');
    this.contextValue = "signedinM365";
    AccountTreeViewProvider.getInstance().refresh();
  }

  dispose(): void {
    AuthenticationState.unsubscribe(this);
  }
}
