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

// Class that represents a Container Type object persisted in the global storage provider
export class ContainerType {
    // instance properties
    public readonly containerTypeId: string;
    public readonly displayName: string;
    public readonly owningAppId: string;
    public readonly billingClassification: number;
    public readonly azureSubscriptionId?: string;
    public readonly creationDate?: string;
    public readonly expiryDate?: string;
    public readonly isBillingProfileRequired?: boolean;
    public secondaryAppIds: string[];
    public registrationIds: string[];

    public owningApp: App;
    public secondaryApps: App[];
    public registrations: ContainerTypeRegistration[];

    public constructor(containerTypeId: string, owningAppId: string, displayName: string, owningApp: App, billingClassification: number, azureSubscriptionId?: string, creationDate?: string, expiryDate?: string, isBillingProfileRequired?: boolean) {
        this.azureSubscriptionId = azureSubscriptionId;
        this.displayName = displayName
        this.owningAppId = owningAppId;
        this.billingClassification = billingClassification;
        this.containerTypeId = containerTypeId;
        this.creationDate = creationDate;
        this.expiryDate = expiryDate;
        this.owningApp = owningApp;
        this.secondaryAppIds = [];
        this.secondaryApps = [];
        this.registrationIds = [];
        this.registrations = [];
    }

    public async addTenantRegistration(tenantId: string, app: App, delegatedPermissions: string[], applicationPermissions: string[]): Promise<boolean> {
        try {
            const tid: any = StorageProvider.get().global.getValue(TenantIdKey);
            const appSecretsString = await StorageProvider.get().secrets.get(app.clientId);
            if (!appSecretsString) {
                return false;
            }
            const appSecrets = JSON.parse(appSecretsString);
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(app.clientId, appSecrets.thumbprint, appSecrets.privateKey)

            const accessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const tenantDomain = await GraphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const certThumbprint = await GraphProvider.getCertThumbprintFromApplication(accessToken, app.clientId);
            const vroomAccessToken = appSecrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, app.clientId, domain, appSecrets.privateKey, tid)


            const containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(`${this.containerTypeId}_${tid}`)!;

            if (!containerTypeRegistration) {
                const containerTypeRegistration = new ContainerTypeRegistration(this.containerTypeId, tid, [new ApplicationPermissions(app.clientId, ["full"], ["full"])])
                await VroomProvider.registerContainerType(vroomAccessToken, app.clientId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);
            } else {
                containerTypeRegistration.applicationPermissions.push(new ApplicationPermissions(app.clientId, delegatedPermissions, applicationPermissions));
                await VroomProvider.registerContainerType(vroomAccessToken, app.clientId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);
            }

            // Save Container Type registration to storage
            await containerTypeRegistration.saveToStorage()

            // Update properties on ContainerType 
            this.registrationIds.push(`${this.containerTypeId}_${tid}`)
            this.registrations.push(containerTypeRegistration);

            if (this.owningAppId != app.clientId) {
                this.secondaryAppIds.push(app.clientId);
                this.secondaryApps.push(app);
            }

            await this.saveToStorage();
            //vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDict[owningAppId].ContainerTypeId} on 3P application: ${this.globalStorageManager.getValue(CurrentApplicationKey)}`);
            return true;
        } catch (error: any) {
            //vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error.response);

            // TODO
            // remove registered app id from global storage?
            // remove application that failed registration from global storage?

            return false;
        }

    }

    public static async loadFromStorage(containerTypeId: string): Promise<ContainerType | undefined> {
        let containerType: ContainerType | undefined = StorageProvider.get().global.getValue<ContainerType>(containerTypeId);
        if (containerType) {
            containerType = await containerType.loadFromStorage(containerTypeId);
            return containerType;
        }
        return undefined;
    }

    public async loadFromStorage(containerTypeId: string): Promise<ContainerType | undefined> {
        const containerType: ContainerType = StorageProvider.get().global.getValue<ContainerType>(containerTypeId);
        if (containerType) {
            // hydrate owning App
            const app = await App.loadFromStorage(containerType.owningAppId);
            containerType.owningApp = app!;

            // hydrate App objects
            const appPromises = this.secondaryAppIds.map(async (appId) => {
                const app = App.loadFromStorage(appId);
                return app;
            });

            const unfilteredApps: (App | undefined)[] = await Promise.all(appPromises);
            const secondaryApps = unfilteredApps.filter(app => app !== undefined) as App[];

            // hydrate Container Type Regisration objects
            const containerTypeRegistrationPromises = this.registrationIds.map(async (registrationId) => {
                const containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(registrationId);
                return containerTypeRegistration;
            });

            const unfilteredContainerTypeRegistrations: (ContainerTypeRegistration | undefined)[] = await Promise.all(containerTypeRegistrationPromises);
            const registrations = unfilteredContainerTypeRegistrations.filter(ct => ct !== undefined) as ContainerTypeRegistration[];

            containerType.secondaryApps = secondaryApps;
            containerType.registrations = registrations;

            return containerType;
        }
        return undefined;
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