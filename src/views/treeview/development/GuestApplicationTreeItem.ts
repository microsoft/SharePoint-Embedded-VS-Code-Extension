/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { App } from "../../../models/App";
import { ContainerType } from "../../../models/ContainerType";
import { ApplicationTreeItem } from "./ApplicationTreeItem";
import { ApplicationPermissions } from "../../../models/ApplicationPermissions";

export class GuestApplicationTreeItem extends vscode.TreeItem {
    constructor(
        public app: ApplicationPermissions,
        public containerType: ContainerType,
    ) {
        super(app.appName, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "guestApplication";
    }
    
}