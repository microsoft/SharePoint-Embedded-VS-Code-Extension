/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpConsumingApplicationProperties } from "../services/SpAdminProviderNew";
import { Account } from "./Account";

export class ApplicationPermissions {

    public readonly owningAppId: string;
    public readonly appId: string;
    public readonly appName: string;
    public readonly delegated: ApplicationPermission[];
    public readonly appOnly: ApplicationPermission[];

    public constructor(properties: ISpConsumingApplicationProperties) { 
        this.owningAppId = properties.OwningApplicationId!;
        this.appId = properties.ApplicationId!;
        this.appName = properties.ApplicationName!;
        this.delegated = properties.DelegatedPermissions as ApplicationPermission[];
        this.appOnly = properties.AppOnlyPermissions as ApplicationPermission[];
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
    "DeleteOwnPermission";
