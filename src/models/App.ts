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
    private clientSecret?: string;
    private thumbprint?: string;
    private privateKey?: string;

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