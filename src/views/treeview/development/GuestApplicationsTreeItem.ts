/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./GuestApplicationTreeItem";
import { ContainerType } from "../../../models/ContainerType";
import { ApplicationPermissions } from "../../../models/ApplicationPermissions";

export class GuestApplicationsTreeItem extends vscode.TreeItem {

    constructor(
        public containerType: ContainerType
    ) {
        super('Guest Apps', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "guestApplications";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children: vscode.TreeItem[] = [];
        const registration = await this.containerType.localRegistration;
        if (registration) {
            const apps = await registration.applicationPermissions;
            apps.map((app: ApplicationPermissions) => {
                children.push(new GuestApplicationTreeItem(app, this.containerType));
            });
        }
        return children;
    }

}