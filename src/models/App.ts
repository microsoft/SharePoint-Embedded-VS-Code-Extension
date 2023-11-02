/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCertKeyCredential, generateCertificateAndPrivateKey } from "../cert";
import ThirdPartyAuthProvider from "../services/3PAuthProvider";
import GraphProvider from "../services/GraphProvider";
import PnPProvider from "../services/PnPProvider";
import { StorageProvider } from "../services/StorageProvider";
import { OwningAppIdKey, OwningAppIdsListKey, TenantIdKey } from "../utils/constants";
import { Account } from "./Account";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { ContainerType } from "./ContainerType";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";

// Class that represents an Azure AD application object persisted in the global storage provider
export class App {
    // instance properties
    public readonly clientId: string;
    public readonly displayName: string;
    public readonly objectId: string;
    public readonly tenantId: string;
    public readonly isOwningApp: boolean;
    public containerTypeIds: string[];
    private clientSecret?: string;
    private thumbprint?: string;
    private privateKey?: string;

    private constructor(clientId: string, displayName: string, objectId: string, tenantId: string, isOwningApp: boolean, clientSecret?: string, thumbprint?: string, privateKey?: string) {
        this.clientId = clientId;
        this.displayName = displayName;
        this.objectId = objectId;
        this.tenantId = tenantId;
        this.isOwningApp = isOwningApp;
        this.clientSecret = clientSecret;
        this.thumbprint = thumbprint;
        this.privateKey = privateKey;
        this.containerTypeIds = [];
    }

    public static async create(displayName: string, token: string, isOwningApp: boolean): Promise<App | undefined> {
        const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
        const certKeyCredential = createCertKeyCredential(certificatePEM);
        const properties = await GraphProvider.createAadApplication(displayName, token, certKeyCredential);
        if (properties) {
            const app = new App(properties.appId, displayName, properties.id, Account.get()!.tenantId, isOwningApp, undefined, thumbprint, privateKey);
            app.saveToStorage();
            app.addAppSecretWithDelay(token, 20 * 1000);
            return app;
        }
        return undefined;
    }

    public async createContainerType(appId: string, containerTypeName: string): Promise<boolean> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return false;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)
        const tid: any = StorageProvider.get().global.getValue(TenantIdKey);
        
        const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

        const appPermissions = new ApplicationPermissions(appId, ["full"], ["full"]);
        const app = await App.loadFromStorage(appId);

        // Create ContainerType if none exist in global store, else register application on existing ContainerType
        if (app!.containerTypeIds.length !== 0) {
            // Currently, we support only 1 trial ContainerType per tenant, so we extract the first item of the Apps' containerTypeIds
            const containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(`${this.containerTypeIds[0]}_${tid}`)
            containerTypeRegistration!.applicationPermissions.push(appPermissions);
            containerTypeRegistration!.saveToStorage(this.containerTypeIds[0], tid);
            //vscode.window.showInformationMessage(`Registering App ${thirdPartyAppId} on ContainerType ${containerTypeDict[thirdPartyAppId]}`);
            return true;
        } else {
            const containerTypeDetails = await PnPProvider.createNewContainerType(spToken, domain, appId, containerTypeName);
            const containerType = new ContainerType(containerTypeDetails.ContainerTypeId, 
                containerTypeDetails.OwningAppId, 
                containerTypeDetails.SPContainerTypeBillingClassification, 
                containerTypeDetails.AzureSubscriptionId,
                containerTypeDetails.CreationDate,
                containerTypeDetails.ExpiryDate,
                containerTypeDetails.isBillingProfileRequired);

            // Update App with ContainerTypeId
            this.containerTypeIds.push(containerType.containerTypeId);
            await app!.saveToStorage();

            // Create and store new ContainerTypeRegistration
            const containerTypeRegistration = new ContainerTypeRegistration(containerType.containerTypeId, tid, [appPermissions]);
            containerTypeRegistration.saveToStorage(containerType.containerTypeId, tid);
            
            // Store Container Type properties
            containerType.saveToStorage();

            StorageProvider.get().global.setValue(OwningAppIdKey, appId);
            //vscode.window.showInformationMessage(`ContainerType ${containerTypeDetails.ContainerTypeId} created successfully`);
            return true
        }
    }

    private async addAppSecretWithDelay(token: string, delay: number): Promise<void> {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    await this.addAppSecret(token);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, delay);
        });
    }

    private async addAppSecret(token: string): Promise<void> {
        const passwordCredential: any = await GraphProvider.addPasswordWithRetry(token, this.clientId);
        if (passwordCredential && passwordCredential.secretText) {
            await GraphProvider.addIdentifierUri(token, this.clientId);
            this.clientSecret = passwordCredential.secretText;
            await this.saveToStorage();
        }
    }

    public static async loadFromStorage(clientId: string): Promise<App | undefined> {
        const app: App = StorageProvider.get().global.getValue<App>(clientId);
        if (app) {
            const appSecretsString = await StorageProvider.get().secrets.get(clientId);
            if (appSecretsString) {
                const appSecrets = JSON.parse(appSecretsString);
                app.clientSecret = appSecrets.clientSecret;
                app.thumbprint = appSecrets.thumbprint;
                app.privateKey = appSecrets.privateKey;
            }
            return app;
        }
        return undefined;
    }
    
    public async saveToStorage(): Promise<void> {
        StorageProvider.get().global.setValue(this.clientId, this);
        const appSecrets = {
            clientSecret: this.clientSecret,
            thumbprint: this.thumbprint,
            privateKey: this.privateKey
        };
        await StorageProvider.get().secrets.store(this.clientId, JSON.stringify(appSecrets));
    }
}