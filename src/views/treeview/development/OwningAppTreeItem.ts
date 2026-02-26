/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ContainerType, Application } from "../../../models/schemas";
import { AppTreeItem } from "./AppTreeItem";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";

export class OwningAppTreeItem extends AppTreeItem {
    private _application: Application | undefined;

    constructor(public readonly containerType: ContainerType, public readonly parentView: IChildrenProvidingTreeItem) {
        // Initially create with app ID as label, will be updated when we fetch the full app
        super(containerType.owningAppId);
        this.description = vscode.l10n.t("(owning app)");
        this.contextValue += '-local';
        
        // Asynchronously load the full application details
        this._loadApplicationDetails();
    }

    public get application(): Application | undefined {
        return this._application;
    }

    private async _loadApplicationDetails(): Promise<void> {
        const graphProvider = GraphProvider.getInstance();

        // Step 1: Try local app registry
        try {
            const application = await graphProvider.applications.get(this.containerType.owningAppId, { useAppId: true });
            if (application) {
                this._application = application;
                this.label = application.displayName || application.appId || 'Unknown App';
                DevelopmentTreeViewProvider.instance.refresh(this);
                return;
            }
        } catch (error) {
            console.error('Error loading application details:', error);
        }

        // Step 2: Try service principal (finds multi-tenant apps)
        try {
            const sp = await graphProvider.applications.getServicePrincipal(this.containerType.owningAppId);
            if (sp?.displayName) {
                this.label = sp.displayName;
                this.contextValue = this.contextValue?.replace('-local', '');
                DevelopmentTreeViewProvider.instance.refresh(this);
            }
        } catch {
            // Not found — keep appId as label
        }
    }
}