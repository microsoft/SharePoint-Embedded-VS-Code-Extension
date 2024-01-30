/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ThirdPartyAuthProvider from "../services/3PAuthProvider";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";
import _ from 'lodash';
import { Account } from "./Account";

// Class that represents an Azure AD application object persisted in the global storage provider
export class App {

    // instance properties
    public readonly clientId: string;
    public readonly objectId: string;
    public readonly tenantId: string;
    public readonly isOwningApp: boolean;
    public displayName: string;
    public thumbprint: string;
    public privateKey: string;
    public clientSecret?: string;
    public authProvider: ThirdPartyAuthProvider;


    public constructor(clientId: string, displayName: string, objectId: string, tenantId: string, isOwningApp: boolean, thumbprint: string, privateKey: string, clientSecret?: string, ) {
        this.clientId = clientId;
        this.displayName = displayName;
        this.objectId = objectId;
        this.tenantId = tenantId;
        this.isOwningApp = isOwningApp;
        this.clientSecret = clientSecret;
        this.thumbprint = thumbprint;
        this.privateKey = privateKey;
        this.authProvider = new ThirdPartyAuthProvider(this.clientId, this.thumbprint, this.privateKey);
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
        try {
            await this.authProvider.grantAdminConsent(['00000003-0000-0ff1-ce00-000000000000/.default'], this.clientId, this.tenantId);
            const consentToken = await this.authProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            const graphAccessToken = await Account.getFirstPartyAccessToken();
            return typeof consentToken === 'string' && typeof graphAccessToken === 'string';
        } catch (error) {
            console.error(error);
            throw error;
        }
        
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
            return new App(retrievedApp.clientId, retrievedApp.displayName, retrievedApp.objectId, retrievedApp.tenantId, retrievedApp.isOwningApp, app.thumbprint, app.privateKey, app.clientSecret);
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

    public async deleteFromStorage(): Promise<void> {
        await StorageProvider.get().global.setValue(this.clientId, undefined);
        await StorageProvider.get().secrets.delete(this.clientId);
    }
}