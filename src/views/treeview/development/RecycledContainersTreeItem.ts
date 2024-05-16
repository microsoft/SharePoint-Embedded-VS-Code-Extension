/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../../models/ContainerType";
import { Container } from "../../../models/Container";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { ContainerTypeRegistration } from "../../../models/ContainerTypeRegistration";
import { RecycledContainerTreeItem } from "./RecycledContainerTreeItem";
import { LocalRegistrationTreeItem } from "./LocalRegistrationTreeItem";

export class RecycledContainersTreeItem extends IChildrenProvidingTreeItem {

    public get containerType(): ContainerType {
        return this.containerTypeRegistration.containerType;
    }

    constructor(public containerTypeRegistration: ContainerTypeRegistration, public reigstrationViewModel: LocalRegistrationTreeItem) {
        super('Recycled Containers', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "spe:recycledContainersTreeItem";
    }

    public async getChildren() {
        const children: vscode.TreeItem[] = [];
        try {
            const containers = await this.containerTypeRegistration.loadRecycledContainers();
            containers?.map((container: Container) => {
                children.push(new RecycledContainerTreeItem(container, this.reigstrationViewModel));
            });
        } catch (error) {
            console.error(`Unable to show recycled containers: ${error}`);
        }
        return children;
    }
}
