/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ContainerType } from "../../../models/ContainerType";
import { AppTreeItem } from "./AppTreeItem";
import { DevelopmentTreeViewProvider } from "./DevelopmentTreeViewProvider";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";

export class OwningAppTreeItem extends AppTreeItem {
    constructor(public readonly containerType: ContainerType, public readonly parentView: IChildrenProvidingTreeItem) {
        const app = containerType.owningApp!;
        super(app);
        this.description = vscode.l10n.t("(owning app)");
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
}