/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpConsumingApplicationProperties } from "../services/SpAdminProviderNew";
import { Account } from "./Account";
import { ApplicationPermissions } from "./ApplicationPermissions";

// Class that represents a Container Type Registration object
export class ContainerTypeRegistration {
    // instance properties
    public readonly containerTypeId: string;
    public readonly tenantId: string;
    public readonly owningAppId: string;
    public readonly applications: string[];

    public constructor(properties: ISpConsumingApplicationProperties) {
        this.containerTypeId = properties.ContainerTypeId!;
        this.tenantId = properties.TenantId!;
        this.owningAppId = properties.OwningApplicationId!;
        this.applications = properties.Applications;
    }

    private _applicationPermissions: Promise<ApplicationPermissions[]> | undefined;
    public get applicationPermissions(): Promise<ApplicationPermissions[]> {
        if (!this._applicationPermissions) {
            const provider = Account.get()!.containerTypeProvider;
            this._applicationPermissions = new Promise<ApplicationPermissions[]>(async (resolve) => {
                const appPerms = this.applications.map(async (appId: string) => {
                    const perms = await provider.getLocalAppPermissions(this.owningAppId, appId);
                    return new ApplicationPermissions(perms);
                });
                resolve(await Promise.all(appPerms));
            });
        }
        return this._applicationPermissions!;
    }

}