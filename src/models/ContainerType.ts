/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import _ from 'lodash';
import { acquireAppOnlyCertSPOToken } from "../cert";
import ThirdPartyAuthProvider from "../services/3PAuthProvider";
import GraphProvider from "../services/GraphProvider";
import PnPProvider from "../services/PnPProvider";
import { StorageProvider } from "../services/StorageProvider";
import VroomProvider from "../services/VroomProvider";
import { AppPermissionsListKey, ContainerTypeListKey, CurrentApplicationKey, OwningAppIdKey, RegisteredContainerTypeSetKey, TenantIdKey } from "../utils/constants";
import { App } from "./App";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";
import { Container } from './Container';

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
    public readonly azureSubscriptionId?: string;
    public readonly creationDate?: string;
    public readonly expiryDate?: string;
    public readonly isBillingProfileRequired?: boolean;
    public secondaryAppIds: string[];
    public registrationIds: string[];

    public owningApp: App | undefined;
    public secondaryApps: App[];
    public registrations: ContainerTypeRegistration[];
    public containers: Container[];

    public constructor(containerTypeId: string,
        owningAppId: string,
        displayName: string,
        billingClassification: number,
        owningTenantId: string,
        owningApp?: App,
        azureSubscriptionId?: string,
        creationDate?: string,
        expiryDate?: string,
        isBillingProfileRequired?: boolean,
        registrationIds?: string[],
        secondaryAppIds?: string[]) {
        this.azureSubscriptionId = azureSubscriptionId;
        this.displayName = displayName
        this.owningAppId = owningAppId;
        this.billingClassification = billingClassification;
        this.containerTypeId = containerTypeId;
        this.owningTenantId = owningTenantId;
        this.creationDate = creationDate;
        this.expiryDate = expiryDate;
        this.owningApp = owningApp;
        this.secondaryAppIds = secondaryAppIds ? secondaryAppIds : [];
        this.secondaryApps = [];
        this.registrationIds = registrationIds ? registrationIds : [];
        this.registrations = [];
        this.containers = [];
    }

    public async addTenantRegistration(tenantId: string, app: App, delegatedPermissions: string[], applicationPermissions: string[]): Promise<boolean> {
        try {
            const appSecretsString = await StorageProvider.get().secrets.get(this.owningAppId);
            if (!appSecretsString) {
                return false;
            }
            const appSecrets = JSON.parse(appSecretsString);
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(this.owningAppId, appSecrets.thumbprint, appSecrets.privateKey)

            const accessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const tenantDomain = await GraphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const certThumbprint = await GraphProvider.getCertThumbprintFromApplication(accessToken, this.owningAppId);
            const vroomAccessToken = appSecrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, this.owningAppId, domain, appSecrets.privateKey, tenantId)

            let containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(`${this.containerTypeId}_${tenantId}`)!;

            if (!containerTypeRegistration) {
                containerTypeRegistration = new ContainerTypeRegistration(this.containerTypeId, tenantId, [new ApplicationPermissions(app.clientId, ["full"], ["full"])])
                await VroomProvider.registerContainerType(vroomAccessToken, this.owningAppId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);
                this.registrationIds.push(`${this.containerTypeId}_${tenantId}`);
                this.registrations.push(containerTypeRegistration);
            } else {
                containerTypeRegistration.applicationPermissions.push(new ApplicationPermissions(app.clientId, delegatedPermissions, applicationPermissions));
                await VroomProvider.registerContainerType(vroomAccessToken, this.owningAppId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);

                // find existing registration in instance, and update it
                const indexToReplace = this.registrations.findIndex(registration => registration.id === containerTypeRegistration.id);
                this.registrations[indexToReplace] = containerTypeRegistration;
            }

            // Save Container Type registration to storage
            await containerTypeRegistration.saveToStorage()

            if (this.owningAppId != app.clientId) {
                this.secondaryAppIds.push(app.clientId);
                this.secondaryApps.push(app);
            }

            await this.saveToStorage();
            //vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDict[owningAppId].ContainerTypeId} on 3P application: ${this.globalStorageManager.getValue(CurrentApplicationKey)}`);
            return true;
        } catch (error: any) {
            //vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error);

            // TODO
            // remove registered app id from global storage?
            // remove application that failed registration from global storage?

            return false;
        }

    }

    public async getContainers(): Promise<Container[]> {
        const appSecretsString = await StorageProvider.get().secrets.get(this.owningApp!.clientId);
            if (!appSecretsString) {
                return [];
            }
        const appSecrets = JSON.parse(appSecretsString);
        const provider = new ThirdPartyAuthProvider(this.owningApp!.clientId, appSecrets.thumbprint, appSecrets.privateKey);
        const token = await provider.getToken(['FileStorageContainer.Selected']);
        const sparseContainers: any[] = await GraphProvider.listStorageContainers(token, this.containerTypeId);

        const containerPromises = sparseContainers.map(container => {
            return GraphProvider.getStorageContainer(token, container.id)
        })

        const containers = await Promise.all(containerPromises)
        
        this.containers = containers.map(container => {
            return new Container(container.id, container.displayName, container.description, this.containerTypeId, container.status, container.createdDateTime);
        });

        return this.containers;
    }

    public async createContainer(displayName: string, description: string) {
        const appSecretsString = await StorageProvider.get().secrets.get(this.owningApp!.clientId);
            if (!appSecretsString) {
                return false;
            }
        const appSecrets = JSON.parse(appSecretsString);
        const provider = new ThirdPartyAuthProvider(this.owningApp!.clientId, appSecrets.thumbprint, appSecrets.privateKey);
        const token = await provider.getToken(['FileStorageContainer.Selected']);
        const createdContainer = await GraphProvider.createStorageContainer(token, this.containerTypeId, displayName, description);
        const createdContainerInstance = new Container(createdContainer.id, createdContainer.displayName, createdContainer.description, this.containerTypeId, createdContainer.status, createdContainer.createdDateTime);
        this.containers.push(createdContainerInstance);
        return createdContainerInstance;
    }

    public static async loadFromStorage(containerTypeId: string): Promise<ContainerType | undefined> {
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
                containerTypeProps.secondaryAppIds)
            containerType = await containerType.loadFromStorageInstance(containerType);
            return containerType;
        }
        return undefined;
    }

    public async loadFromStorageInstance(containerType: ContainerType): Promise<ContainerType> {
        // hydrate owning App
        const appProps = await App.loadFromStorage(containerType.owningAppId);
        if (appProps)
            containerType.owningApp = new App(appProps.clientId, appProps.displayName, appProps.objectId, appProps.tenantId, appProps.isOwningApp, appProps.clientSecret, appProps.thumbprint, appProps.privateKey);

        // hydrate App objects
        const appPromises = containerType.secondaryAppIds.map(async (appId) => {
            const app = App.loadFromStorage(appId);
            return app;
        });
        const unfilteredApps: (App | undefined)[] = await Promise.all(appPromises);
        const secondaryApps = unfilteredApps.filter(app => app !== undefined) as App[];
        const secondaryAppsInstances = secondaryApps.map(appProps => {
            // Storage loads App props, so we use props to instantiate App instances 
            return new App(appProps.clientId, appProps.displayName, appProps.objectId, appProps.tenantId, appProps.isOwningApp, appProps.clientSecret, appProps.thumbprint, appProps.privateKey);
        });

        // hydrate Container Type Regisration objects
        const containerTypeRegistrationPromises = containerType.registrationIds.map(async (registrationId) => {
            const containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(registrationId);
            return containerTypeRegistration;
        });
        const unfilteredContainerTypeRegistrations: (ContainerTypeRegistration | undefined)[] = await Promise.all(containerTypeRegistrationPromises);
        const registrations = unfilteredContainerTypeRegistrations.filter(ct => ct !== undefined) as ContainerTypeRegistration[];
        const registrationsInstances = registrations.map(registrationProps => {
            // Storage loads App props, so we use props to instantiate App instances 
            return new ContainerTypeRegistration(registrationProps.containerTypeId, registrationProps.tenantId, registrationProps.applicationPermissions);
        });

        containerType.secondaryApps = secondaryAppsInstances;
        containerType.registrations = registrationsInstances;

        return containerType;
    }

    public async saveToStorage(): Promise<void> {
        const containerTypeCopy = _.cloneDeep(this);
        const { owningApp, secondaryApps, registrations, ...containerType } = containerTypeCopy;
        await StorageProvider.get().global.setValue(this.containerTypeId, containerType);
    }

    public static loadAllContainerTypesFromStorage(): { [key: string]: any } | {} {
        return StorageProvider.get().global.getValue(ContainerTypeListKey) || {};
    }
}