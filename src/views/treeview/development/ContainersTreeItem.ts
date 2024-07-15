/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTreeItem } from "./ContainerTreeItem";
import { ContainerType } from "../../../models/ContainerType";
import { Container } from "../../../models/Container";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerTypeRegistration } from "../../../models/ContainerTypeRegistration";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";

export class ContainersTreeItem extends IChildrenProvidingTreeItem {

    public get containerType(): ContainerType {
        return this.containerTypeRegistration.containerType;
    }

    constructor(public containerTypeRegistration: ContainerTypeRegistration, public reigstrationViewModel: LocalRegistrationTreeItem) {
        super(vscode.l10n.t('Containers'), vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:containersTreeItem";
    }

    public async getChildren() {
        const children: vscode.TreeItem[] = [];
        try {
            const containers = await this.containerTypeRegistration.loadContainers();
            containers?.map((container: Container) => {
                children.push(new ContainerTreeItem(container, this.reigstrationViewModel));
            });
        } catch (error) {
        }
        return children;
    }
}
