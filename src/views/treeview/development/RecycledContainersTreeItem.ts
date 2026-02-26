/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { RecycledContainerTreeItem } from "./RecycledContainerTreeItem";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";

export class RecycledContainersTreeItem extends IChildrenProvidingTreeItem {

    constructor(public readonly containerTypeId: string, public registrationViewModel: LocalRegistrationTreeItem) {
        super(vscode.l10n.t('Recycled Containers'), vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:recycledContainersTreeItem";
    }

    public async getChildren() {
        const children: vscode.TreeItem[] = [];
        try {
            const containers = await GraphProvider.getInstance().containers.listRecycled(this.containerTypeId);
            containers?.map((container) => {
                children.push(new RecycledContainerTreeItem(container, this.registrationViewModel));
            });
        } catch (error) {
            console.error('[RecycledContainersTreeItem.getChildren]', error);
        }
        return children;
    }
}
