/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./guestApplicationTreeItem";
import { ContainerType } from "../../models/ContainerType";

export class GuestApplicationsTreeItem extends vscode.TreeItem {
    private appsItem?: GuestApplicationTreeItem[];

    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState

    ) {
        super(label, collapsibleState);
        this.contextValue = "guestApplications";
        this.appsItem = [];
    }

    public async getChildren() {
        this.appsItem = this._getApps();
        return this.appsItem;
    }

    private _getApps() {
        const appItems = this.containerType.guestApps.map(
            (app) => {
                return new GuestApplicationTreeItem(app, this.containerType, app.displayName, vscode.TreeItemCollapsibleState.None);
            }
        );
        return appItems;
    }
}