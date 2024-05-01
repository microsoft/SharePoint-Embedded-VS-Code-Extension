/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GraphProviderNew } from "../services/GraphProviderNew";
import { ISpConsumingApplicationProperties } from "../services/SpAdminProviderNew";
import { Account } from "./Account";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { Container } from "./Container";
import { ContainerType } from "./ContainerType";

// Class that represents a Container Type Registration object
export class ContainerTypeRegistration {
    // instance properties
    public get containerTypeId(): string {
        return this.containerType.containerTypeId;
    }
    public readonly tenantId: string;
    public readonly owningAppId: string;
    public readonly applications: string[];

    public constructor(public readonly containerType: ContainerType, properties: ISpConsumingApplicationProperties) {
        this.tenantId = properties.TenantId!;
        this.owningAppId = properties.OwningApplicationId!;
        this.applications = properties.Applications;
    }

    private _applicationPermissions?: ApplicationPermissions[];
    public get applicationPermissions(): ApplicationPermissions[] | undefined {
        return this._applicationPermissions;
    }
    public async loadApplicationPermissions(): Promise<ApplicationPermissions[] | undefined> {
        if (Account.get() && Account.get()!.containerTypeProvider) {
            const provider = Account.get()!.containerTypeProvider;
            const appPerms = this.applications.map(async (appId: string) => {
                return await provider.getAppPermissions(this, appId);
            });
            this._applicationPermissions = await Promise.all(appPerms);
        }
        return this._applicationPermissions;
    }

    private _containers?: Container[];
    public get containers(): Container[] | undefined {
        return this._containers;
    }
    public async loadContainers(): Promise<Container[] | undefined> {
        if (!this.containerType.owningApp) {
            await this.containerType.loadOwningApp();
        }
        if (this.containerType.owningApp) {
            const authProvider = await this.containerType.owningApp.getAppOnlyAuthProvider(this.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            this._containers = await graphProvider.listContainers(this);
        }
        return this._containers;
    }

    private _recycledContainers?: Container[];
    public get recycledContainers(): Container[] | undefined {
        return this._recycledContainers;
    }
    public async loadRecycledContainers(): Promise<Container[] | undefined> {
        if (!this.containerType.owningApp) {
            await this.containerType.loadOwningApp();
        }
        if (this.containerType.owningApp) {
            const authProvider = await this.containerType.owningApp.getAppOnlyAuthProvider(this.tenantId);
            const graphProvider = new GraphProviderNew(authProvider);
            this._recycledContainers = await graphProvider.listRecycledContainers(this);
        }
        return this._recycledContainers;
    }

}