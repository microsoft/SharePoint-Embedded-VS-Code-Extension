/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { App } from "../../../models/App";
import { ContainerType } from "../../../models/ContainerType";
import { AppTreeItem } from "./AppTreeItem";
import { ApplicationPermissions } from "../../../models/ApplicationPermissions";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";

export class GuestApplicationTreeItem extends AppTreeItem {
    constructor(public appPerms: ApplicationPermissions) {
        super(appPerms.app ? appPerms.app : appPerms.appId);
        this.contextValue += '-guest';
        if (!appPerms.app) {
            appPerms.loadApp().then(app => {
                if (app) {
                    this.label = app.name;
                    DevelopmentTreeViewProvider.instance.refresh(this);
                }
            });
        }
    }
    
}