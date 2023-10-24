/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ApplicationTreeItem } from "./applicationTreeItem";
import { ContainerTreeItem } from "./containerTreeItem";
import { CreateAppProvider } from "../../services/CreateAppProvider";
import { ext } from "../../utils/extensionVariables";
import ThirdPartyAuthProvider from "../../services/3PAuthProvider";

export class ContainersTreeItem extends vscode.TreeItem {
    private containerItems?: ContainerTreeItem[];
    private createAppServiceProvider: CreateAppProvider;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean }

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
        this.createAppServiceProvider = CreateAppProvider.getInstance(ext.context);
        this.containerItems = []
    }

    public async getChildren() {
        const containersGraphResponse: any = await this.getContainers();
        //const containersGraphResponse: any = [1,2,3,4,5];
        this.containerItems = containersGraphResponse.value.map((container: any) => {
            return new ContainerTreeItem(container.displayName, vscode.TreeItemCollapsibleState.None,  {name: "symbol-field", custom: false });
        })
        return this.containerItems;
    }

    private async getContainers(): Promise<any> {
        const owningAppId: string = this.createAppServiceProvider.globalStorageManager.getValue("OwningAppId");
        const containerTypeDict: { [key: string]: any } = this.createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList") || {};

        if (owningAppId == null || owningAppId == undefined) {
            return [];
        }

        const secrets = await this.createAppServiceProvider.getSecretsByAppId(owningAppId);
        const provider = new ThirdPartyAuthProvider(owningAppId, secrets.thumbprint, secrets.privateKey);
        const token = await provider.getToken(['FileStorageContainer.Selected']);
        const containers = await this.createAppServiceProvider.graphProvider.listStorageContainers(token, containerTypeDict[owningAppId].ContainerTypeId);
        return containers;
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
