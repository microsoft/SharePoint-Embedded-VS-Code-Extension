/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ThirdPartyAuthProvider from "../services/3PAuthProvider";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";
import { OwningAppIdKey, OwningAppIdsListKey, TenantIdKey } from "../utils/constants";
import _ from 'lodash';

// Class that represents an Azure AD application object persisted in the global storage provider
export class App {
    // instance properties
    public readonly clientId: string;
    public readonly displayName: string;
    public readonly objectId: string;
    public readonly tenantId: string;
    public readonly isOwningApp: boolean;
    public clientSecret?: string;
    public thumbprint?: string;
    public privateKey?: string;

    public constructor(clientId: string, displayName: string, objectId: string, tenantId: string, isOwningApp: boolean, clientSecret?: string, thumbprint?: string, privateKey?: string) {
        this.clientId = clientId;
        this.displayName = displayName;
        this.objectId = objectId;
        this.tenantId = tenantId;
        this.isOwningApp = isOwningApp;
        this.clientSecret = clientSecret;
        this.thumbprint = thumbprint;
        this.privateKey = privateKey;
    }

    
    public async addAppSecretWithDelay(token: string, delay: number): Promise<void> {
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

    public async addAppSecret(token: string): Promise<void> {
        const passwordCredential: any = await GraphProvider.addPasswordWithRetry(token, this.clientId);
        if (passwordCredential && passwordCredential.secretText) {
            await GraphProvider.addIdentifierUri(token, this.clientId);
            this.clientSecret = passwordCredential.secretText;
            await this.saveToStorage();
        }
    }

    public async consent() {
        const appSecretsString = await StorageProvider.get().secrets.get(this.clientId);
        if (!appSecretsString) {
            return false;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(this.clientId, appSecrets.thumbprint, appSecrets.privateKey)
        const tid: any = StorageProvider.get().global.getValue(TenantIdKey);
        
        const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

        return consentToken && graphAccessToken;
    }

    public static async loadFromStorage(clientId: string): Promise<App | undefined> {
        const retrievedApp: App = StorageProvider.get().global.getValue<App>(clientId);
        const app = _.cloneDeep(retrievedApp);
        if (app) {
            const appSecretsString = await StorageProvider.get().secrets.get(clientId);
            if (appSecretsString) {
                const appSecrets = JSON.parse(appSecretsString);
                app.clientSecret = appSecrets.clientSecret;
                app.thumbprint = appSecrets.thumbprint;
                app.privateKey = appSecrets.privateKey;
            }
            return new App(retrievedApp.clientId, retrievedApp.displayName, retrievedApp.objectId, retrievedApp.tenantId, retrievedApp.isOwningApp, app.clientSecret, app.thumbprint, app.privateKey);
        }
    return undefined;
    }
    
    public async saveToStorage(): Promise<void> {
        const appCopy = _.cloneDeep(this);
        const { clientSecret, thumbprint, privateKey, ...app } = appCopy;
        await StorageProvider.get().global.setValue(this.clientId, app);
        const appSecrets = {
            clientSecret: this.clientSecret,
            thumbprint: this.thumbprint,
            privateKey: this.privateKey
        };
        const appSecretsString = JSON.stringify(appSecrets);
        await StorageProvider.get().secrets.store(this.clientId, appSecretsString);
    }
}