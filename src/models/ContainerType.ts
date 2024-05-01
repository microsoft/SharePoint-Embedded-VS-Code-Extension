/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import _ from 'lodash';
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
import axios from 'axios';

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

    public get isTrial(): boolean {
        return this.billingClassification === BillingClassification.FreeTrial;
    }

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

    public get localRegistrationScope(): string {
        const account = Account.get()!;
        return `${account.spRootSiteUrl}/.default`;
    }

    public async registerOnLocalTenant(): Promise<void> {
        const account = Account.get()!;
        const app = await this.loadOwningApp();
        if (!app) {
            throw new Error("Unable to load owning app");
        }
        const authProvider = await app.getAppOnlyAuthProvider(account.tenantId);
        const scope = `${account.spRootSiteUrl}/.default`;
        const accessToken = await authProvider.getToken([this.localRegistrationScope]);
        const baseUrl = `/_api/v2.1/storageContainerTypes/${this.containerTypeId}/applicationPermissions`;
        const url = `${account.spRootSiteUrl}${baseUrl}`;
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }
        };
        const body = {
            value: [
                {
                    appId: app.clientId,
                    delegated: ["full"],
                    appOnly: ["full"]
                }
            ]
        };
        console.log(url);
        console.log(accessToken);
        console.log(body);
        return axios.put(url, JSON.stringify(body), options);
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




}