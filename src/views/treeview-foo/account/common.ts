/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from "vscode";

export enum AccountItemStatus {
  SignedOut,
  SigningIn,
  SignedIn,
  Switching,
}

export const loadingIcon = new vscode.ThemeIcon("loading~spin");
export const errorIcon = new vscode.ThemeIcon(
  "error",
  new vscode.ThemeColor("notificationsErrorIcon.foreground")
);
export const infoIcon = new vscode.ThemeIcon(
  "info",
  new vscode.ThemeColor("notificationsInfoIcon.foreground")
);
export const warningIcon = new vscode.ThemeIcon(
  "warning",
  new vscode.ThemeColor("editorLightBulb.foreground")
);
export const passIcon = new vscode.ThemeIcon(
  "pass",
  new vscode.ThemeColor("debugIcon.startForeground")
);
export const m365Icon = new vscode.ThemeIcon("spe-m365");
export const signOutIcon = new vscode.ThemeIcon("sign-out");
export const azureIcon = new vscode.ThemeIcon("azure");
