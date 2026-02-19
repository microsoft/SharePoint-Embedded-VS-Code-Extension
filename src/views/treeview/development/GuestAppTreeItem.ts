/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppTreeItem } from "./AppTreeItem";
import { ContainerTypeAppPermissionGrant, Application } from "../../../models/schemas";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";

export class GuestApplicationTreeItem extends AppTreeItem {
    public application?: Application;

    constructor(
        public readonly grant: ContainerTypeAppPermissionGrant,
        public readonly containerTypeId: string,
        public readonly parentView: IChildrenProvidingTreeItem
    ) {
        super(grant.appId);
        this.contextValue += '-guest';

        // Async-load the application display name
        GraphProvider.getInstance().applications.get(grant.appId, { useAppId: true }).then(app => {
            if (app) {
                this.application = app;
                this.label = app.displayName;
                this.contextValue += '-local';
                DevelopmentTreeViewProvider.instance.refresh(this);
            }
        });
    }

}
