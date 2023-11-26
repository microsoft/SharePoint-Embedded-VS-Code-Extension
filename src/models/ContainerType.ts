/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import _ from 'lodash';
import { acquireAppOnlyCertSPOToken } from "../cert";
import ThirdPartyAuthProvider from "../services/3PAuthProvider";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";
import VroomProvider from "../services/VroomProvider";
import { App } from "./App";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";
import { Container } from './Container';
import { Account } from './Account';
import { TenantDomain } from '../utils/constants';
import { timeoutForSeconds } from '../utils/timeout';
import { decodeJwt, checkJwtForTenantAdminScope, checkJwtForAppOnlyRole } from '../utils/token';

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
    public guestAppIds: string[];
    public registrationIds: string[];

    public owningApp: App | undefined;
    public guestApps: App[];
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
        guestAppIds?: string[]) {
        this.azureSubscriptionId = azureSubscriptionId;
        this.displayName = displayName
        this.owningAppId = owningAppId;
        this.billingClassification = billingClassification;
        this.containerTypeId = containerTypeId;
        this.owningTenantId = owningTenantId;
        this.creationDate = creationDate;
        this.expiryDate = expiryDate;
        this.owningApp = owningApp;
        this.guestAppIds = guestAppIds ? guestAppIds : [];
        this.guestApps = [];
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
            const domain: string = await StorageProvider.get().global.getValue(TenantDomain);
            const token = await Account.getFirstPartyAccessToken();

            const certThumbprint = await GraphProvider.getCertThumbprintFromApplication(token, this.owningAppId);
            let vroomAccessToken = appSecrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, this.owningAppId, domain, appSecrets.privateKey, tenantId);
            let decodedToken = decodeJwt(vroomAccessToken);
            let retries = 0;
            const maxRetries = 3;
            while (!checkJwtForAppOnlyRole(decodedToken, "Container.Selected") && retries < maxRetries) {
                retries++;
                console.log(`Attempt ${retries}: 'Container.Selected' role not found on token fetch for Container Type Registration. Waiting for 5 seconds...`);
                await timeoutForSeconds(5);
                // Get a new token
                vroomAccessToken = await acquireAppOnlyCertSPOToken(certThumbprint, this.owningAppId, domain, appSecrets.privateKey, tenantId);
                decodedToken = decodeJwt(vroomAccessToken);
            }

            if (!checkJwtForAppOnlyRole(decodedToken, "Container.Selected")) {
                throw new Error("'Container.Selected' role not found on token fetch for Container Type Registration.")
            }

            let containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(`${this.containerTypeId}_${tenantId}`)!;

            if (!containerTypeRegistration) {
                containerTypeRegistration = new ContainerTypeRegistration(this.containerTypeId, tenantId, [new ApplicationPermissions(app.clientId, ["full"], ["full"])])
                await VroomProvider.registerContainerType(vroomAccessToken, this.owningAppId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);
                this.registrationIds.push(`${this.containerTypeId}_${tenantId}`);
                this.registrations.push(containerTypeRegistration);
            } else {
                const applicationPermissionIndex = containerTypeRegistration.applicationPermissions.findIndex((permission) => permission.appId === app.clientId);
                if (applicationPermissionIndex === -1) {
                    containerTypeRegistration.applicationPermissions.push(new ApplicationPermissions(app.clientId, delegatedPermissions, applicationPermissions));
                } else {
                    containerTypeRegistration.applicationPermissions[applicationPermissionIndex] = new ApplicationPermissions(app.clientId, delegatedPermissions, applicationPermissions);
                }

                await VroomProvider.registerContainerType(vroomAccessToken, this.owningAppId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);

                // find existing registration in instance, and update it
                const indexToReplace = this.registrations.findIndex(registration => registration.id === containerTypeRegistration.id);
                this.registrations[indexToReplace] = containerTypeRegistration;
            }

            // Save Container Type registration to storage
            await containerTypeRegistration.saveToStorage();

            if (this.owningAppId != app.clientId) {
                this.guestAppIds.push(app.clientId);
                this.guestApps.push(app);
            }

            await this.saveToStorage();
            return true;
        } catch (error: any) {
            //vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error);
            throw error;
            // TODO
            // remove registered app id from global storage?
            // remove application that failed registration from global storage?
        }

    }

    public async getContainers(): Promise<Container[]> {
        const appSecretsString = await StorageProvider.get().secrets.get(this.owningApp!.clientId);
        if (!appSecretsString) {
            return [];
        }
        const appSecrets = JSON.parse(appSecretsString);
        const provider = new ThirdPartyAuthProvider(this.owningApp!.clientId, appSecrets.thumbprint, appSecrets.privateKey);
        const token = await provider.getToken(["00000003-0000-0000-c000-000000000000/.default"]);
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
        const token = await provider.getToken(["00000003-0000-0000-c000-000000000000/.default"]);
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
                containerTypeProps.guestAppIds)
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
        const appPromises = containerType.guestAppIds.map(async (appId) => {
            const app = App.loadFromStorage(appId);
            return app;
        });
        const unfilteredApps: (App | undefined)[] = await Promise.all(appPromises);
        const guestApps = unfilteredApps.filter(app => app !== undefined) as App[];
        const guestAppsInstances = guestApps.map(appProps => {
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
            return new ContainerTypeRegistration(registrationProps.containerTypeId, registrationProps.tenantId, registrationProps.applicationPermissions);
        });

        containerType.guestApps = guestAppsInstances;
        containerType.registrations = registrationsInstances;

        return containerType;
    }

    public async saveToStorage(): Promise<void> {
        const containerTypeCopy = _.cloneDeep(this);
        const { owningApp, guestApps, registrations, ...containerType } = containerTypeCopy;
        await StorageProvider.get().global.setValue(this.containerTypeId, containerType);
    }

    public async deleteFromStorage(): Promise<void> {
        const secretPromises: Thenable<void>[] = [];

        secretPromises.push(StorageProvider.get().global.setValue(this.containerTypeId, undefined));

        this.registrationIds.forEach(async registrationId => {
            secretPromises.push(StorageProvider.get().global.setValue(registrationId, undefined));
        });

        this.guestAppIds.forEach(async guestAppId => {
            secretPromises.push(StorageProvider.get().global.setValue(guestAppId, undefined));
        });

        await Promise.all(secretPromises);
    }
}