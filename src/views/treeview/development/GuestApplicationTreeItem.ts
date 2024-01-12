/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { App } from "../../../models/App";
import { ContainerType } from "../../../models/ContainerType";
import { ApplicationTreeItem } from "./ApplicationTreeItem";

export class GuestApplicationTreeItem extends ApplicationTreeItem {
    constructor(
        public app: App,
        public containerType: ContainerType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(app, containerType, label, collapsibleState);
        this.contextValue = "guestApplication";
    }
    
}