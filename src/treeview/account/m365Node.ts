/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { DynamicNode } from "../dynamicNode";
import { AccountItemStatus, m365Icon, signOutIcon } from "./common";

export class M365AccountNode extends DynamicNode {
  public status: AccountItemStatus;

  constructor(private eventEmitter: vscode.EventEmitter<DynamicNode | undefined | void>) {
    super("Login to M365");
    this.status = AccountItemStatus.SignedOut;
    this.command = {
      command: 'srs.login',
      title: 'Login to M365'
    }
  }

  public setSignedIn(upn: string) {
    if (this.status === AccountItemStatus.SignedIn) {
      return;
    }
    this.status = AccountItemStatus.SignedIn;
    this.label = upn;
    this.contextValue = "signedinM365";
    // refresh
    this.eventEmitter.fire(this);
  }

  public setSignedOut() {
    if (this.status === AccountItemStatus.SignedOut) {
      return;
    }
    this.status = AccountItemStatus.SignedOut;
    this.contextValue = "signinM365";
    // refresh
    this.eventEmitter.fire(this);
  }

  public override getChildren(): vscode.ProviderResult<DynamicNode[]> {
    return [this];
  }
  public override getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    if (this.status !== AccountItemStatus.SignedIn) {
      this.label = "Sign in to Microsoft 365";
      this.iconPath = m365Icon;
      this.command = {
        title: this.label,
        command: "srs.login"
      };
    }
    return this;
  }
}