/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Account } from "../models/Account";
import { ApplicationPermissions } from "../models/ApplicationPermissions";
import { BillingClassification, ContainerType } from "../models/ContainerType";
import { ContainerTypeRegistration } from "../models/ContainerTypeRegistration";
import SpAdminProvider, { ISpContainerTypeCreationProperties } from "./SpAdminProvider";

export default class ContainerTypeProvider {

    public constructor (private _spAdminProvider: SpAdminProvider) {}

    public async list(): Promise<ContainerType[]> {
        const containerTypesProperties = await this._spAdminProvider.listContainerTypes();
        const containerTypes = containerTypesProperties.map(async (ct) => {
            return await this.get(ct.ContainerTypeId);
        });
        return Promise.all(containerTypes);
    }

    public async get(containerTypeId: string): Promise<ContainerType> {
        const containerTypeProperties = await this._spAdminProvider.getContainerType(containerTypeId);
        containerTypeProperties.OwningTenantId = Account.get()!.tenantId;
        return new ContainerType(containerTypeProperties);
    }

    public async getLocalRegistration(containerType: ContainerType): Promise<ContainerTypeRegistration | undefined> {
        const registrationProperties = await this._spAdminProvider.getConsumingApplication(containerType.owningAppId);
        if (registrationProperties) {
            registrationProperties.TenantId = Account.get()!.tenantId;
            registrationProperties.ContainerTypeId = containerType.containerTypeId;
            return new ContainerTypeRegistration(containerType, registrationProperties);
        }
    }
    
    public async getAppPermissions(containerTypeRegistration: ContainerTypeRegistration, appId?: string): Promise<ApplicationPermissions> {
        const owningAppId = containerTypeRegistration.owningAppId;
        const appPermissionsProps = await this._spAdminProvider.getConsumingApplication(owningAppId, appId);
        return new ApplicationPermissions(containerTypeRegistration, appPermissionsProps);
    }

    public async create(properties: ISpContainerTypeCreationProperties): Promise<ContainerType> {
        const containerTypeProperties = await this._spAdminProvider.createContainerType(properties);
        containerTypeProperties.OwningTenantId = Account.get()!.tenantId;
        return new ContainerType(containerTypeProperties);
    }

    public async createTrial(displayName: string, owningAppId: string): Promise<ContainerType> {
        const properties: ISpContainerTypeCreationProperties = {
            DisplayName: displayName,
            OwningAppId: owningAppId,
            SPContainerTypeBillingClassification: BillingClassification.FreeTrial
        };
        return this.create(properties);
    }

    public async createPaid(displayName: string, azureSubscriptionId: string, resourceGroup: string, region: string, owningAppId: string): Promise<ContainerType> {
        const properties: ISpContainerTypeCreationProperties = {
            DisplayName: displayName,
            AzureSubscriptionId: azureSubscriptionId,
            ResourceGroup: resourceGroup,
            Region: region,
            OwningAppId: owningAppId,
            SPContainerTypeBillingClassification: BillingClassification.Paid
        };
        return this.create(properties);
    }

    public async delete(containerType: ContainerType): Promise<void> {
        await this._spAdminProvider.deleteContainerType(containerType.containerTypeId);
    }

    public async rename(containerType: ContainerType, displayName: string): Promise<void> {
        await this._spAdminProvider.setContainerTypeProperties(containerType.containerTypeId, undefined, displayName, undefined);
    }
}