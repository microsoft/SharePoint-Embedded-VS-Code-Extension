/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppTreeItem } from "./AppTreeItem";
import { ApplicationPermissions } from "../../../models/ApplicationPermissions";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";

export class GuestApplicationTreeItem extends AppTreeItem {
    constructor(public appPerms: ApplicationPermissions, public readonly parentView: IChildrenProvidingTreeItem) {
        super(appPerms.app ? appPerms.app : appPerms.appId);
        this.contextValue += '-guest';
        if (!appPerms.app) {
            appPerms.loadApp().then(app => {
                if (app) {
                    this.label = app.name;
                    this.contextValue += '-local';
                    app.getSecrets().then(secrets => {
                        if (secrets.clientSecret) {
                            this.contextValue += '-hasSecret';
                        }
                        if (secrets.thumbprint && secrets.privateKey) {
                            this.contextValue += '-hasCert';
                        }
                        DevelopmentTreeViewProvider.instance.refresh(this);
                    });
                }
            });
        }     
    }
    
}