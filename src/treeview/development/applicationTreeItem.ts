/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTreeItem } from "./containerTreeItem";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ext } from "../../utils/extensionVariables";

export class ApplicationTreeItem extends vscode.TreeItem {
    private appItem?: ApplicationTreeItem[];
    private containersListItem: ContainerTreeItem[] | undefined;
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);

        this.appItem

    }

    getChildren() {
        return [this.appItem, this.containersListItem]
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