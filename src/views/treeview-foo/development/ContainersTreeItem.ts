/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTreeItem } from "./ContainerTreeItem";
import { ContainerType } from "../../../models/ContainerType";
import { Container } from "../../../models/Container";

export class ContainersTreeItem extends vscode.TreeItem {
    private containerItems?: ContainerTreeItem[];

    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState

    ) {
        super(label, collapsibleState);
        this.containerItems = [];
        this.contextValue = "containers";
    }

    public async getChildren() {
        const containers: Container[] = await this.containerType.getContainers();
        this.containerItems = containers.map((container: Container) => {
            return new ContainerTreeItem(container.displayName, container.description, vscode.TreeItemCollapsibleState.None);
        });
        return this.containerItems;
    }
}
