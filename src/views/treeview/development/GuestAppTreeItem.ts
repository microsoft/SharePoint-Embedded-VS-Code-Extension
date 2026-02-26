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
        this._resolveDisplayName();
    }

    private async _resolveDisplayName(): Promise<void> {
        const graphProvider = GraphProvider.getInstance();

        // Step 1: Try local app registry
        const app = await graphProvider.applications.get(this.grant.appId, { useAppId: true });
        if (app) {
            this.application = app;
            this.label = app.displayName;
            this.contextValue += '-local';
            DevelopmentTreeViewProvider.instance.refresh(this);
            return;
        }

        // Step 2: Try service principal (finds multi-tenant apps)
        try {
            const sp = await graphProvider.applications.getServicePrincipal(this.grant.appId);
            if (sp?.displayName) {
                this.label = sp.displayName;
                DevelopmentTreeViewProvider.instance.refresh(this);
            }
        } catch {
            // Not found — keep appId as label
        }
    }

}
