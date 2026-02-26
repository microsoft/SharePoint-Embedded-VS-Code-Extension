/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTreeItem } from "./ContainerTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
import { ensureExtensionAppPermissions } from "../../../utils/ExtensionAppPermissions";

export class ContainersTreeItem extends IChildrenProvidingTreeItem {

    constructor(public readonly containerTypeId: string, public reigstrationViewModel: LocalRegistrationTreeItem) {
        super(vscode.l10n.t('Containers'), vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:containersTreeItem";
    }

    public async getChildren() {
        const children: vscode.TreeItem[] = [];

        const hasPermissions = await ensureExtensionAppPermissions(this.containerTypeId);
        if (!hasPermissions) {
            return children;
        }

        try {
            const containers = await GraphProvider.getInstance().containers.list(this.containerTypeId);
            containers?.map((container) => {
                children.push(new ContainerTreeItem(container, this.reigstrationViewModel));
            });
        } catch (error) {
        }
        return children;
    }
}
