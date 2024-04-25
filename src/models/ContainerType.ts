/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import _ from 'lodash';
import { acquireAppOnlyCertSPOToken } from "../cert";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";
import VroomProvider from "../services/VroomProvider";
import { App } from "./App";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";
import { Container } from './Container';
import { Account } from './Account';
import { timeoutForSeconds } from '../utils/timeout';
import { decodeJwt, checkJwtForAppOnlyRole } from '../utils/token';
import { ISpContainerTypeProperties } from '../services/SpAdminProviderNew';
import AppProvider from '../services/AppProvider';
import ContainerTypeProvider from '../services/ContainerTypeProvider';

export enum BillingClassification {
    Paid = 0,
    FreeTrial = 1
}

// Class that represents a Container Type object persisted in the global storage provider
export class ContainerType {
    // instance properties
    public readonly containerTypeId: string;
    public readonly displayName: string;
    public readonly owningAppId: string;
    public readonly owningTenantId: string;
    public readonly billingClassification: number;
    public readonly azureSubscriptionId: string | null;
    public readonly creationDate: string | null;
    public readonly expiryDate: string | null;
    public readonly isBillingProfileRequired: boolean;
    public readonly region?: string | undefined;
    public readonly resourceGroup?: string | undefined;
    public guestApps: App[] = [];

    private _owningApp?: App;
    public get owningApp(): App | undefined {
        return this._owningApp;
    }
    public async loadOwningApp(): Promise<App | undefined> {
        if (Account.get() && Account.get()!.appProvider) {
            const provider = Account.get()!.appProvider;
            this._owningApp = await provider.get(this.owningAppId);
        }
        return this._owningApp;
    }

    private _localRegistration?: ContainerTypeRegistration;
    public get localRegistration(): ContainerTypeRegistration | undefined {
        return this._localRegistration;
    }
    public async loadLocalRegistration(): Promise<ContainerTypeRegistration | undefined> {
        if (Account.get() && Account.get()!.containerTypeProvider) {
            const provider = Account.get()!.containerTypeProvider;
            this._localRegistration = await provider.getLocalRegistration(this);
        }
        return this._localRegistration;
    }

    public constructor(properties: ISpContainerTypeProperties) {
        this.azureSubscriptionId = properties.AzureSubscriptionId;
        this.displayName = properties.DisplayName;
        this.owningAppId = properties.OwningAppId;
        this.billingClassification = properties.SPContainerTypeBillingClassification;
        this.containerTypeId = properties.ContainerTypeId;
        this.owningTenantId = properties.OwningTenantId;
        this.creationDate = properties.CreationDate;
        this.expiryDate = properties.ExpiryDate;
        this.isBillingProfileRequired = properties.IsBillingProfileRequired;
    }

    public getProperties(): ISpContainerTypeProperties {
        return {
            AzureSubscriptionId: this.azureSubscriptionId,
            DisplayName: this.displayName,
            OwningAppId: this.owningAppId,
            SPContainerTypeBillingClassification: this.billingClassification,
            ContainerTypeId: this.containerTypeId,
            OwningTenantId: this.owningTenantId,
            CreationDate: this.creationDate,
            ExpiryDate: this.expiryDate,
            IsBillingProfileRequired: this.isBillingProfileRequired,
            ApplicationRedirectUrl: '',
            Region: this.region, 
            ResourceGroup: this.resourceGroup
        };
    }

    public async addTenantRegistration(tenantId: string, app: App, delegatedPermissions: string[], applicationPermissions: string[]): Promise<boolean> {
       return false;/* try {
            const appSecretsString = await StorageProvider.get().secrets.get(this.owningAppId);
            if (!appSecretsString) {
                return false;
            }
            const appSecrets = JSON.parse(appSecretsString);
            const token = await Account.getFirstPartyAccessToken();
            const account = Account.get()!;

            const certThumbprint = await GraphProvider.getCertThumbprintFromApplication(token, this.owningAppId);
            let vroomAccessToken = appSecrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, this.owningAppId, account.domain, appSecrets.privateKey, tenantId);
            let decodedToken = decodeJwt(vroomAccessToken);
            let retries = 0;
            const maxRetries = 3;
            while (!checkJwtForAppOnlyRole(decodedToken, "Container.Selected") && retries < maxRetries) {
                retries++;
                console.log(`Attempt ${retries}: 'Container.Selected' role not found on token fetch for Container Type Registration. Waiting for 5 seconds...`);
                await timeoutForSeconds(5);
                // Get a new token
                vroomAccessToken = await acquireAppOnlyCertSPOToken(certThumbprint, this.owningAppId, account.domain, appSecrets.privateKey, tenantId);
                decodedToken = decodeJwt(vroomAccessToken);
            }

            if (!checkJwtForAppOnlyRole(decodedToken, "Container.Selected")) {
                throw new Error("'Container.Selected' role not found on token fetch for Container Type Registration.");
            }

            let containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(`${this.containerTypeId}_${tenantId}`)!;

            if (!containerTypeRegistration) {
                containerTypeRegistration = new ContainerTypeRegistration(this.containerTypeId, tenantId, [new ApplicationPermissions(app.clientId, ["full"], ["full"])]);
                await VroomProvider.registerContainerType(vroomAccessToken, this.owningAppId, `https://${account.domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);
                this.registrationIds.push(`${this.containerTypeId}_${tenantId}`);
                this.registrations.push(containerTypeRegistration);
            } else {
                const applicationPermissionIndex = containerTypeRegistration.applicationPermissions.findIndex((permission) => permission.appId === app.clientId);
                if (applicationPermissionIndex === -1) {
                    containerTypeRegistration.applicationPermissions.push(new ApplicationPermissions(app.clientId, delegatedPermissions, applicationPermissions));
                } else {
                    containerTypeRegistration.applicationPermissions[applicationPermissionIndex] = new ApplicationPermissions(app.clientId, delegatedPermissions, applicationPermissions);
                }

                await VroomProvider.registerContainerType(vroomAccessToken, this.owningAppId, `https://${account.domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);

                // find existing registration in instance, and update it
                const indexToReplace = this.registrations.findIndex(registration => registration.id === containerTypeRegistration.id);
                this.registrations[indexToReplace] = containerTypeRegistration;
            }

            // Save Container Type registration to storage
            await containerTypeRegistration.saveToStorage();

            if (this.owningAppId !== app.clientId) {
                this.guestAppIds.push(app.clientId);
                this.guestApps.push(app);
            }

            //await this.saveToStorage();
            return true;
        } catch (error: any) {
            //vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error);
            throw error;
            // TODO
            // remove registered app id from global storage?
            // remove application that failed registration from global storage?
        }
*/
    }

    private _containers?: Container[];
    public get containers(): Container[] | undefined {
        return this._containers;
    }

    public async getContainers(): Promise<Container[]> {
        /*
        const token = await this.owningApp?.authProvider.getToken(["00000003-0000-0000-c000-000000000000/.default"]);
        if (!token) {
            throw new Error("Unable to get access token from owning app");
        }
        const sparseContainers: any[] = await GraphProvider.listStorageContainers(token, this.containerTypeId);

        const containerPromises = sparseContainers.map(container => {
            return GraphProvider.getStorageContainer(token, container.id);
        });

        const containers = await Promise.all(containerPromises);

        this.containers = containers.map(container => {
            return new Container(container.id, container.displayName, container.description, this.containerTypeId, container.status, container.createdDateTime);
        });

        return this.containers;
        */
        return [];
    }

    public async createContainer(displayName: string, description: string) {
        /*
        const token = await this.owningApp?.authProvider.getToken(["00000003-0000-0000-c000-000000000000/.default"]);
        if (!token) {
            throw new Error("Unable to get access token from owning app");
        }
        const createdContainer = await GraphProvider.createStorageContainer(token, this.containerTypeId, displayName, description);
        const createdContainerInstance = new Container(createdContainer.id, createdContainer.displayName, createdContainer.description, this.containerTypeId, createdContainer.status, createdContainer.createdDateTime);
        this.containers.push(createdContainerInstance);
        return createdContainerInstance;
        */
        return undefined;
    }

    public static async loadFromStorage(containerTypeId: string): Promise<ContainerType | undefined> {
        /*
        let containerTypeProps: ContainerType | undefined = StorageProvider.get().global.getValue<ContainerType>(containerTypeId);
        if (containerTypeProps) {
            let containerType = new ContainerType(
                containerTypeProps.containerTypeId,
                containerTypeProps.owningAppId,
                containerTypeProps.displayName,
                containerTypeProps.billingClassification,
                containerTypeProps.owningTenantId,
                undefined,
                containerTypeProps.azureSubscriptionId,
                containerTypeProps.creationDate,
                containerTypeProps.expiryDate,
                containerTypeProps.isBillingProfileRequired,
                containerTypeProps.registrationIds,
                containerTypeProps.guestAppIds);
            containerType = await containerType._loadFromStorage(containerType);
            return containerType;
        }
        */
        return undefined;
    }
/*
    private async _loadFromStorage(containerType: ContainerType): Promise<ContainerType> {
        /*
        // hydrate owning App
        const appProps = await App.loadFromStorage(containerType.owningAppId);
        if (appProps) {
            containerType.owningApp = new App(appProps.clientId, appProps.displayName, appProps.objectId, appProps.tenantId, appProps.isOwningApp, appProps.thumbprint, appProps.privateKey, appProps.clientSecret);
        }
        
        // hydrate App objects
        const appPromises = containerType.guestAppIds.map(async (appId) => {
            const app = App.loadFromStorage(appId);
            return app;
        });
        const unfilteredApps: (App | undefined)[] = await Promise.all(appPromises);
        const guestApps = unfilteredApps.filter(app => app !== undefined) as App[];
        const guestAppsInstances = guestApps.map(appProps => {
            // Storage loads App props, so we use props to instantiate App instances 
            return new App(appProps.clientId, appProps.displayName, appProps.objectId, appProps.tenantId, appProps.isOwningApp, appProps.thumbprint, appProps.privateKey, appProps.clientSecret);
        });

        // hydrate Container Type Regisration objects
        const containerTypeRegistrationPromises = containerType.registrationIds.map(async (registrationId) => {
            const containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(registrationId);
            return containerTypeRegistration;
        });
        const unfilteredContainerTypeRegistrations: (ContainerTypeRegistration | undefined)[] = await Promise.all(containerTypeRegistrationPromises);
        const registrations = unfilteredContainerTypeRegistrations.filter(ct => ct !== undefined) as ContainerTypeRegistration[];
        const registrationsInstances = registrations.map(registrationProps => {
            return new ContainerTypeRegistration(registrationProps.containerTypeId, registrationProps.tenantId, registrationProps.applicationPermissions);
        });

        containerType.guestApps = guestAppsInstances;
        containerType.registrations = registrationsInstances;

        return containerType;
    }
*/

    public async saveToStorage(): Promise<void> {
        /*
        const containerTypeCopy = _.cloneDeep(this);
        const { owningApp, guestApps, registrations, ...containerType } = containerTypeCopy;
        await StorageProvider.get().global.setValue(this.containerTypeId, containerType);
        */
    }

    public async deleteFromStorage(): Promise<void> {
        const secretPromises: Thenable<void>[] = [];

        secretPromises.push(StorageProvider.get().global.setValue(this.containerTypeId, undefined));
/*
        this.registrationIds.forEach(async registrationId => {
            secretPromises.push(StorageProvider.get().global.setValue(registrationId, undefined));
        });

        this.guestAppIds.forEach(async guestAppId => {
            secretPromises.push(StorageProvider.get().global.setValue(guestAppId, undefined));
        });
*/
        await Promise.all(secretPromises);
    }

}