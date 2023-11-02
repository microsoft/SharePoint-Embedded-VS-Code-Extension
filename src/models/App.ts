/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCertKeyCredential, generateCertificateAndPrivateKey } from "../cert";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";
import { OwningAppIdsListKey } from "../utils/constants";
import { Account } from "./Account";

// Class that represents an Azure AD application object persisted in the global storage provider
export class App {
    // instance properties
    public readonly clientId: string;
    public readonly displayName: string;
    public readonly objectId: string;
    public readonly tenantId: string;
    private clientSecret?: string;
    private thumbprint?: string;
    private privateKey?: string;

    private constructor(clientId: string, displayName: string, objectId: string, tenantId: string, clientSecret?: string, thumbprint?: string, privateKey?: string) {
        this.clientId = clientId;
        this.displayName = displayName;
        this.objectId = objectId;
        this.tenantId = tenantId;
        this.clientSecret = clientSecret;
        this.thumbprint = thumbprint;
        this.privateKey = privateKey;
    }

    public static async create(displayName: string, token: string): Promise<App | undefined> {
        const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
        const certKeyCredential = createCertKeyCredential(certificatePEM);
        const properties = await GraphProvider.createAadApplication(displayName, token, certKeyCredential);
        if (properties) {
            const app = new App(properties.appId, displayName, properties.id, Account.get()!.tenantId, undefined, thumbprint, privateKey);
            app.saveToStorage();
            app.addAppSecretWithDelay(token, 20 * 1000);
            return app;
        }
        return undefined;
    }

    public async createContainerType(token: string): Promise<void> {
        //await App.graph.createContainerType(token, this.clientId);
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
        const appsDictionary: any = StorageProvider.get().global.getValue("apps") || {};
        const app = appsDictionary[clientId];
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
        const appsDictionary: any = StorageProvider.get().global.getValue("apps") || {};
        appsDictionary[this.clientId] = this;
        StorageProvider.get().global.setValue("apps", appsDictionary);
        const appSecrets = {
            clientSecret: this.clientSecret,
            thumbprint: this.thumbprint,
            privateKey: this.privateKey
        };
        await StorageProvider.get().secrets.store(this.clientId, JSON.stringify(appSecrets));
    }

    public static async loadApplicationsFromStorage(): Promise<App[]> {
        const appsDictionary: any = StorageProvider.get().global.getValue("apps");
        const apps: App[] = await Promise.all(
            Object.keys(appsDictionary).map(async (appId) => {
                const props = appsDictionary[appId];
                const app = new App(props.appId, props.displayName, props.id, props.tenantId);
                const appSecretsString = await StorageProvider.get().secrets.get(appId);
                if (appSecretsString) {
                    const appSecrets = JSON.parse(appSecretsString);
                    app.clientSecret = appSecrets.clientSecret;
                    app.thumbprint = appSecrets.thumbprint;
                    app.privateKey = appSecrets.privateKey;
                }
                return app;
            })
        );
        return apps;
    }

    public static saveOwningAppIdToStorage(appId: string): void {
        const owningAppIds: string[] = StorageProvider.get().global.getValue(OwningAppIdsListKey) || [];
        owningAppIds.push(appId);
        StorageProvider.get().global.setValue(OwningAppIdsListKey, owningAppIds);
    }

    public static getOwningAppIdsFromStorage(): string[] {
        return StorageProvider.get().global.getValue(OwningAppIdsListKey);
    }

}