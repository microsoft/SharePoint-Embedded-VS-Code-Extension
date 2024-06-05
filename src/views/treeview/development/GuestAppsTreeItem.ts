/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GuestApplicationTreeItem } from "./GuestAppTreeItem";
import { ApplicationPermissions } from "../../../models/ApplicationPermissions";
import { ContainerTypeRegistration } from "../../../models/ContainerTypeRegistration";
import _ from "lodash";
import { ContainerType } from "../../../models/ContainerType";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";

export class GuestAppsTreeItem extends IChildrenProvidingTreeItem {

    public get containerType(): ContainerType {
        return this.containerTypeRegistration.containerType;
    }

    constructor (public readonly containerTypeRegistration: ContainerTypeRegistration) {
        super('Guest Apps', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:guestAppsTreeItem";
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        const children: vscode.TreeItem[] = [];
        
        try {
            const owningApp = this.containerType.owningApp!;
            const registration = this.containerType.localRegistration!;
            if (!owningApp || !registration) { 
                throw new Error('Owning app or registration not found');
            }
            await registration.loadApplicationPermissions();
            if (!registration.applicationPermissions) {
                throw new Error('No application permissions found');
            }
            registration.applicationPermissions.map((app: ApplicationPermissions) => {
                if (app.appId !== owningApp.clientId) {
                    children.push(new GuestApplicationTreeItem(app, this));
                }
            });
        } catch (error) {
        }

        return children;
    }

}