import { Account } from "../models/Account";
import { BillingClassification, ContainerType } from "../models/ContainerType";
import { ContainerTypeRegistration } from "../models/ContainerTypeRegistration";
import SpAdminProviderNew, { ISpConsumingApplicationProperties, ISpContainerTypeCreationProperties } from "./SpAdminProviderNew";

export default class ContainerTypeProvider {

    public constructor (private _spAdminProvider: SpAdminProviderNew) {}

    public async list(): Promise<ContainerType[]> {
        const containerTypesProperties = await this._spAdminProvider.listContainerTypes();
        return containerTypesProperties.map((ct) => {
            return new ContainerType(ct);
        });
    }

    public async get(containerTypeId: string): Promise<ContainerType> {
        const containerTypeProperties = await this._spAdminProvider.getContainerType(containerTypeId);
        return new ContainerType(containerTypeProperties);
    }

    public async getLocalRegistration(containerTypeId: string, owningAppId: string): Promise<ContainerTypeRegistration | undefined> {
        const registrationProperties = await this._spAdminProvider.getConsumingApplication(owningAppId);
        if (registrationProperties) {
            registrationProperties.TenantId = Account.get()!.tenantId;
            registrationProperties.ContainerTypeId = containerTypeId;
            return new ContainerTypeRegistration(registrationProperties);
        }
    }

    public async getLocalAppPermissions(owningAppId: string, appId: string): Promise<ISpConsumingApplicationProperties> {
        return this._spAdminProvider.getConsumingApplication(owningAppId, appId);
    }

    public async create(properties: ISpContainerTypeCreationProperties): Promise<ContainerType> {
        const containerTypeProperties = await this._spAdminProvider.createContainerType(properties);
        return new ContainerType(containerTypeProperties);
    }

    public async createFree(displayName: string, owningAppId: string): Promise<ContainerType> {
        const properties: ISpContainerTypeCreationProperties = {
            DisplayName: displayName,
            OwningAppId: owningAppId,
            SPContainerTypeBillingClassification: BillingClassification.FreeTrial
        };
        return this.create(properties);
    }
}