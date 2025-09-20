/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ContainerType, Application } from "../../../models/schemas";
import { AppTreeItem } from "./AppTreeItem";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { GraphAuthProvider } from "../../../services/Auth/GraphAuthProvider";
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
        try {
            const graphAuth = GraphAuthProvider.getInstance();
            const graphProvider = GraphProvider.getInstance();
            const application = await graphProvider.applications.get(this.containerType.owningAppId);
            
            if (application) {
                // Store the full application
                this._application = application;
                this.label = application.displayName || application.appId || 'Unknown App';
                
                // TODO: Add logic to check for secrets and certificates
                // This would require additional API calls or storage checking
                // For now, we'll skip the secret/cert status
                
                DevelopmentTreeViewProvider.instance.refresh(this);
            }
        } catch (error) {
            console.error('Error loading application details:', error);
            // Keep the app ID as the label if loading fails
        }
    }
}