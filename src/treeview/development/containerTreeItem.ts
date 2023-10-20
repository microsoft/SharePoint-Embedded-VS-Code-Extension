/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ext } from "../../utils/extensionVariables";

export class ContainerTreeItem extends vscode.TreeItem {
    private containers: any[];
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);

        this.containers =[];

    }

    getChildren() {
        return this.containers;
    }

    // private async getContainers(): any[] {
    //     const appId = containerType.OwningAppId;
    //     const secrets = await this.createAppServiceProvider.getSecretsByAppId(appId);
    //     const provider = new ThirdPartyAuthProvider(appId, secrets.thumbprint, secrets.privateKey);
    //     const token = await provider.getToken(['FileStorageContainer.Selected']);
    //     const containers = await this.createAppServiceProvider.graphProvider.listStorageContainers(token, containerType.ContainerTypeId);
    //     return [];
    // }

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