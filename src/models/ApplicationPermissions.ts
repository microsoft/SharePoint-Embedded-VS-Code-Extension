/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpConsumingApplicationProperties } from "../services/SpAdminProviderNew";
import { Account } from "./Account";
import { App } from "./App";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";

export class ApplicationPermissions {

    public readonly owningAppId: string;
    public readonly appId: string;
    public readonly appName: string;
    public readonly delegated: ApplicationPermission[];
    public readonly appOnly: ApplicationPermission[];
    public readonly apps: string[];

    public constructor(
        public readonly containerTypeRegistration: ContainerTypeRegistration, 
        properties: ISpConsumingApplicationProperties
    ) { 
        this.owningAppId = properties.OwningApplicationId!;
        this.appId = properties.ApplicationId!;
        this.appName = properties.ApplicationName!;
        this.delegated = properties.DelegatedPermissions as ApplicationPermission[];
        this.appOnly = properties.AppOnlyPermissions as ApplicationPermission[];
        this.apps = properties.Applications!;
    }

    private _app?: App;
    public get app(): App | undefined {
        return this._app;
    }
    public async loadApp(): Promise<App | undefined> {
        if (Account.get() && Account.get()!.appProvider) {
            const provider = Account.get()!.appProvider;
            this._app = await provider.get(this.appId);
        }
        return this._app;
    }

}

export type ApplicationPermission = 
    "ReadContent" |
    "WriteContent" |
    "Create" |
    "Delete" |
    "Read" |
    "Write" |
    "EnumeratePermissions" |
    "AddPermissions" |
    "UpdatePermissions" |
    "DeletePermissions" |
    "DeleteOwnPermission" |
    "ManagePermissions";
