/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTreeItem } from "./containerTreeItem";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ext } from "../../utils/extensionVariables";
import ThirdPartyAuthProvider from "../../services/3PAuthProvider";
import { ContainerTypeListKey, OwningAppIdKey } from "../../utils/constants";
import GraphProvider from "../../services/GraphProvider";
import { ContainerType } from "../../models/ContainerType";
import { Container } from "../../models/Container";

export class ContainersTreeItem extends vscode.TreeItem {
    private containerItems?: ContainerTreeItem[];

    constructor(
        public containerType: ContainerType,
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.containerItems = [];
        this.contextValue = "containers";
    }

    public async getChildren() {
        const containers: Container[] = await this.containerType.getContainers();
        this.containerItems = containers.map((container: Container) => {
            return new ContainerTreeItem(container.displayName, container.description, vscode.TreeItemCollapsibleState.None,  {name: "symbol-field", custom: false });
        })
        return this.containerItems;
    }
    private setImagetoIcon() {
        if (this.image !== undefined) {
            if (!this.image.custom) {
                this.iconPath = new vscode.ThemeIcon(
                    this.image.name,
                    new vscode.ThemeColor("icon.foreground")
                );
            }
        }
    }

}
