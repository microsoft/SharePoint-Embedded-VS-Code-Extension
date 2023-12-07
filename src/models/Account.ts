/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore
import { AccountInfo, ProtocolMode } from '@azure/msal-node';
import FirstPartyAuthProvider from '../services/1PAuthProvider';
import { BaseAuthProvider } from '../services/BaseAuthProvider';
import { checkJwtForAdminClaim, checkJwtForTenantAdminScope, decodeJwt, getJwtTenantId } from '../utils/token';
import { App } from './App';
import { StorageProvider } from '../services/StorageProvider';
import { BillingClassification, ContainerType } from './ContainerType';
import { generateCertificateAndPrivateKey, createCertKeyCredential } from '../cert';
import GraphProvider from '../services/GraphProvider';
import ThirdPartyAuthProvider from '../services/3PAuthProvider';
import SPAdminProvider from '../services/SPAdminProvider';
import { TenantIdKey, OwningAppIdKey, TenantDomain, IsContainerTypeCreatingKey } from '../utils/constants';
import { timeoutForSeconds } from '../utils/timeout';

type StoredAccount = {
    appIds: string[],
    containerTypeIds: string[]
};

type AccountData = {
    apps: App[]
    containerTypes: ContainerType[]
};


// Account class that represents an msal AccountInfo object from the FirstPartyAuthProvider
export class Account {
    // Storage key for the account
    public static readonly storageKey: string = "account";
    private static readonly firstPartyAppId: string = "aba7eb80-02fe-4070-8fca-b729f428166f";
    //private static readonly firstPartyAppId: string = "e354d98a-0a53-480d-b6cb-cc66ac4d4c88";
    private static readonly authProvider: BaseAuthProvider = new FirstPartyAuthProvider(Account.firstPartyAppId, Account.storageKey);
    private static readonly scopes: string[] = ['Application.ReadWrite.All', 'User.Read'];
    private static instance: Account | undefined;
    private static subscribers: LoginChangeListener[] = [];
    private static readonly storage: StorageProvider;

    public readonly homeAccountId: string;
    public readonly environment: string;
    public readonly tenantId: string;
    public readonly username: string;
    public readonly localAccountId: string;
    public readonly isAdmin: boolean;
    public readonly name?: string;

    public appIds: string[] = [];
    public containerTypeIds: string[] = [];

    public apps: App[] = [];
    public containerTypes: ContainerType[] = [];


    private constructor(homeAccountId: string, environment: string, tenantId: string, username: string, localAccountId: string, isAdmin: boolean, name?: string) {
        this.homeAccountId = homeAccountId;
        this.environment = environment;
        this.tenantId = tenantId;
        this.username = username;
        this.localAccountId = localAccountId;
        this.name = name;
        this.isAdmin = isAdmin;

        this.loadFromStorage();
    }

    public static get(): Account | undefined {
        return Account.instance;
    }

    public static isLoggedIn(): boolean {
        return Account.instance !== undefined;
    }

    public static async hasSavedAccount(): Promise<boolean> {
        const accountInfo = await Account._getSavedAccount();
        return accountInfo !== undefined && accountInfo !== null;
    }

    private static async _getSavedAccount(): Promise<AccountInfo | null> {
        return await Account.authProvider.getAccount();
    }

    public static async loginToSavedAccount(): Promise<Account | undefined> {
        if (await Account.hasSavedAccount()) {
            return await Account.login();
        }
    }

    public static async login(): Promise<Account | undefined> {
        const token = await Account.authProvider.getToken(Account.scopes);
        if (token) {
            const accountInfo = await Account._getSavedAccount();
            if (accountInfo) {
                const decodedToken = decodeJwt(token);
                const isAdmin = checkJwtForAdminClaim(decodedToken);
                const tid = getJwtTenantId(decodedToken);
                Account.instance = new Account(accountInfo.homeAccountId,
                    accountInfo.environment,
                    accountInfo.tenantId,
                    accountInfo.username,
                    accountInfo.localAccountId,
                    isAdmin,
                    accountInfo.name
                );
                Account._notifyLogin();
                return Account.get();
            }

        }
        return undefined;
    }

    public async logout(): Promise<void> {
        await Account.authProvider.logout();
        await this.deleteFromStorage();
        Account.instance = undefined;
        Account._notifyLogout();
    }

    public static subscribeLoginListener(listener: LoginChangeListener): void {
        Account.subscribers.push(listener);
    }

    public static unsubscribeLoginListener(listener: LoginChangeListener): void {
        const index = Account.subscribers.indexOf(listener);
        if (index > -1) {
            Account.subscribers.splice(index, 1);
        }
    }

    private static _notifyLogin(): void {
        Account.subscribers.forEach((listener) => {
            listener.onLogin(Account.get()!);
        });
    }

    private static _notifyLogout(): void {
        Account.subscribers.forEach((listener) => {
            listener.onLogout();
        });
    }

    public static  onContainerTypeCreationStart(): void {
        StorageProvider.get().temp.set(IsContainerTypeCreatingKey, true);
    }

    public static  onContainerTypeCreationFinish(): void {
         StorageProvider.get().temp.set(IsContainerTypeCreatingKey, false);
    }

    public static getContainerTypeCreationState(): any {
        return StorageProvider.get().temp.get(IsContainerTypeCreatingKey);
    }

    public static async getFirstPartyAccessToken() {
        return await Account.authProvider.getToken(Account.scopes);
    }

    public async createApp(appName: string, isOwningApp: boolean): Promise<App | undefined> {
        const token = await Account.authProvider.getToken(Account.scopes);
        if (token) {
            const app = await Account._createApp(appName, token, isOwningApp);
            if (app) {
                // Save updated app IDs to storage
                this.appIds.push(app.clientId);
                this.apps.push(app);
                await this.saveToStorage();
                return app;
            }
        }
        return undefined;
    }

    public async importApp(appId: string, isOwningApp: boolean): Promise<App | undefined> {
        const token = await Account.authProvider.getToken(Account.scopes);
        if (token) {
            //const app = await GraphProvider.getApplicationById(token, appId);
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
            const certKeyCredential = createCertKeyCredential(certificatePEM);
            const properties = await GraphProvider.configureAadApplication(appId, token, certKeyCredential);
            if (properties) {
                const app = new App(properties.appId, properties.displayName, properties.id, Account.get()!.tenantId, isOwningApp, undefined, thumbprint, privateKey);
                await app.saveToStorage();
                try {
                    await app.addAppSecret(token);
                } catch (error) {
                    console.error(`Failed to add app secret for ${appId} ` + error);
                }
                this.appIds.push(app.clientId);
                this.apps.push(app);
                await this.saveToStorage();
                return app;
            }
        }
        return undefined;
    }

    public async createContainerType(appId: string, containerTypeName: string, billingClassification: BillingClassification): Promise<ContainerType | undefined> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return undefined;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey);
        const domain = await StorageProvider.get().global.getValue(TenantDomain);

        let spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
        let decodedToken = decodeJwt(spToken);
        let retries = 0;
        const maxRetries = 3;
        while (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write") && retries < maxRetries) {
            retries++;
            console.log(`Attempt ${retries}: 'AllSites' scope not found on token fetch for NewContainerType. Waiting for 5 seconds...`);
            await timeoutForSeconds(5);
            // Get a new token
            spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
            decodedToken = decodeJwt(spToken);
        }

        if (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write")) {
            throw new Error("'AllSites' scope not found on token fetch for NewContainerType.");
        }

        try {
            // Create ContainerType if none exist in global store, else register application on existing ContainerType
            if (this.containerTypeIds.length === 0) {
                const containerTypeDetails = await SPAdminProvider.createNewContainerType(spToken, domain, appId, containerTypeName, billingClassification);
                const owningApp = this.apps.find(app => app.clientId === appId)!;
                const containerType = new ContainerType(
                    containerTypeDetails.ContainerTypeId,
                    containerTypeDetails.OwningAppId,
                    containerTypeDetails.DisplayName,
                    containerTypeDetails.SPContainerTypeBillingClassification,
                    containerTypeDetails.OwningTenantId,
                    owningApp,
                    containerTypeDetails.AzureSubscriptionId,
                    containerTypeDetails.CreationDate,
                    containerTypeDetails.ExpiryDate,
                    containerTypeDetails.IsBillingProfileRequired);

                // Store new Container Type
                await containerType.saveToStorage();

                // Update Account with ContainerTypeId
                this.containerTypeIds.push(containerType.containerTypeId);
                this.containerTypes.push(containerType);
                await this.saveToStorage();

                return containerType;
            }
        } catch (error: any) {
            throw error;
        }
    }

    public async importContainerType(containerType: ContainerType, owningApp: App): Promise<ContainerType | undefined> {
        // Re-fetch the Container Type from the service to get the CreationDate and ExpiryDate properties
        // TODO: Remove this line when the server bug is fixed
        const ctDetails = await this.getContainerTypeDetailsById(owningApp.clientId, containerType.containerTypeId)!;
        if (!ctDetails) {
            throw new Error(`Unable to get Container Type ${containerType.containerTypeId} from service.`);
        }
        const ct = new ContainerType(
            ctDetails.ContainerTypeId,
            ctDetails.OwningAppId,
            ctDetails.DisplayName,
            ctDetails.SPContainerTypeBillingClassification,
            ctDetails.OwningTenantId,
            owningApp,
            ctDetails.AzureSubscriptionId,
            ctDetails.CreationDate,
            ctDetails.ExpiryDate,
            ctDetails.IsBillingProfileRequired);

        // Store new Container Type
        await ct.saveToStorage();

        // Update Account with ContainerTypeId
        this.containerTypeIds.push(ct.containerTypeId);
        this.containerTypes.push(ct);
        await this.saveToStorage();

        return ct;
    }

    public async getContainerTypeDetailsById(appId: string, containerTypeId: string): Promise<any> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return undefined;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey);
        const tid: any = StorageProvider.get().global.getValue(TenantIdKey);

        const domain: string = await StorageProvider.get().global.getValue(TenantDomain);
        let spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
        let decodedToken = decodeJwt(spToken);
        let retries = 0;
        const maxRetries = 3;
        while (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write") && retries < maxRetries) {
            retries++;
            console.log(`Attempt ${retries}: 'AllSites' scope not found on token fetch for GetContainerTypeById. Waiting for 5 seconds...`);
            await timeoutForSeconds(5);
            // Get a new token
            spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
            decodedToken = decodeJwt(spToken);
        }

        if (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write")) {
            throw new Error("'AllSites' scope not found on token fetch for NewContainerType.");
        }
        const containerTypeDetails = await SPAdminProvider.getContainerTypeById(spToken, domain, containerTypeId);

        return containerTypeDetails;
    }

    public async getAllContainerTypes(appId: string): Promise<ContainerType[]> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return [];
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey);
        const domain: string = await StorageProvider.get().global.getValue(TenantDomain);

        let spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
        let decodedToken = decodeJwt(spToken);
        let retries = 0;
        const maxRetries = 3;
        while (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write") && retries < maxRetries) {
            retries++;
            console.log(`Attempt ${retries}: 'AllSites' scope not found on token fetch for GetSPOContainerTypes. Waiting for 5 seconds...`);
            await timeoutForSeconds(5);
            // Get a new token
            spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
            decodedToken = decodeJwt(spToken);
        }

        if (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write")) {
            throw new Error("'AllSites' scope not found on token fetch for NewContainerType.");
        }

        try {
            const containerTypeList = await SPAdminProvider.getContainerTypes(spToken, domain);
            const containerTypes: ContainerType[] = [];
            containerTypeList.map((containerTypeProps: any) => {
                const containerType = new ContainerType(
                    containerTypeProps.ContainerTypeId,
                    containerTypeProps.OwningAppId,
                    containerTypeProps.DisplayName,
                    containerTypeProps.SPContainerTypeBillingClassification,
                    containerTypeProps.OwningTenantId,
                    undefined,
                    containerTypeProps.AzureSubscriptionId,
                    containerTypeProps.CreationDate,
                    containerTypeProps.ExpiryDate,
                    containerTypeProps.IsBillingProfileRequired);
                containerTypes.push(containerType);
            });
            return containerTypes;
        } catch (error: any) {
            throw error;
        }
    }

    public async getFreeContainerType(appId?: string): Promise<ContainerType | undefined> {
        if (!appId && this.appIds.length > 0) {
            appId = this.appIds[this.appIds.length - 1];
        }
        if (!appId) {
            return;
        }
        const cts = await this.getAllContainerTypes(appId);
        return cts.find(ct => ct.billingClassification === BillingClassification.FreeTrial);
    }

    public async deleteContainerTypeById(appId: string, containerTypeId: string): Promise<ContainerType | undefined> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return undefined;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey);
        const domain: string = await StorageProvider.get().global.getValue(TenantDomain);

        let spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
        let decodedToken = decodeJwt(spToken);
        let retries = 0;
        const maxRetries = 3;
        while (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write") && retries < maxRetries) {
            retries++;
            console.log(`Attempt ${retries}: 'AllSites' scope not found on token fetch for RemoveSPOContainerType. Waiting for 5 seconds...`);
            await timeoutForSeconds(5);
            // Get a new token
            spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
            decodedToken = decodeJwt(spToken);
        }

        if (!checkJwtForTenantAdminScope(decodedToken, "AllSites.Write")) {
            throw new Error("'AllSites' scope not found on token fetch for NewContainerType.");
        }

        try {
            const containerTypeDetails = await SPAdminProvider.deleteContainerTypeById(spToken, domain, containerTypeId);

            const deletionPromises: Thenable<void>[] = [];
            const containerType = this.containerTypes.find(ct => ct.containerTypeId === containerTypeId);
            this.containerTypeIds = this.containerTypeIds.filter(id => id !== containerTypeId);
            this.containerTypes = this.containerTypes.filter(ct => ct.containerTypeId !== containerTypeId);
    
            await StorageProvider.get().global.setValue(containerTypeId, undefined);
    
            if (containerType && containerType.registrationIds) {
                containerType.registrationIds.forEach(async registrationId => {
                    deletionPromises.push(StorageProvider.get().global.setValue(registrationId, undefined));
                });
            }
    
            await Promise.all(deletionPromises);
    
            await this.saveToStorage();
            return containerTypeDetails;
        } catch (error: any) {
            throw error;
        }
    }

    private static async _createApp(displayName: string, token: string, isOwningApp: boolean): Promise<App | undefined> {
        const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
        const certKeyCredential = createCertKeyCredential(certificatePEM);
        const properties = await GraphProvider.createAadApplication(displayName, token, certKeyCredential);
        if (properties) {
            const app = new App(properties.appId, displayName, properties.id, Account.get()!.tenantId, isOwningApp, undefined, thumbprint, privateKey);
            await app.saveToStorage();
            await app.addAppSecret(token);
            return app;
        }
        return undefined;
    }

    public async deleteApp(app: App): Promise<void> {
        try {
            const appSecretsString = await StorageProvider.get().secrets.get(app.clientId);
            if (!appSecretsString) {
                return undefined;
            }
            const appSecrets = JSON.parse(appSecretsString);
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(app.clientId, appSecrets.thumbprint, appSecrets.privateKey);

            //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/.default"]);

            await GraphProvider.deleteApplication(graphAccessToken, app.clientId);
            await StorageProvider.get().global.setValue(app.clientId, undefined);
            await StorageProvider.get().secrets.delete(app.clientId);
            this.apps = this.apps.filter(storedApp => storedApp.clientId !== app.clientId);
            this.appIds = this.appIds.filter(id => id !== app.clientId);
            await this.saveToStorage();
        } catch (error: any) {
            console.log(error);
            return;
        }
    }

    public async searchApps(searchString?: string, excludeSaved: boolean = false): Promise<any[]> {
        const token = await Account.authProvider.getToken(Account.scopes);
        const appData = await GraphProvider.listApplications(token, searchString);
        if (excludeSaved) {
            return appData.filter((app: any) => !this.appIds.includes(app.appId));
        }
        return appData;
    }

    
    public async renameApp(app: App, displayName: string): Promise<void> {
        const token = await Account.authProvider.getToken(Account.scopes);
        await GraphProvider.renameApplication(token, app.clientId, displayName)
        app.displayName = displayName;
        app.saveToStorage();
    }

    public async loadFromStorage(): Promise<void> {
        const storedAccount: StoredAccount = JSON.parse(StorageProvider.get().global.getValue(Account.storageKey));

        if (!storedAccount) {
            return;
        }

        // hydrate App objects
        const appPromises = storedAccount.appIds.map(async (appId) => {
            const app = App.loadFromStorage(appId);
            return app;
        });

        const unfilteredApps: (App | undefined)[] = await Promise.all(appPromises);
        const apps = unfilteredApps.filter(app => app !== undefined) as App[];

        this.appIds = storedAccount.appIds;
        this.apps = apps;

        // hydrate Container Type objects
        const containerTypePromises = storedAccount.containerTypeIds.map(async (containerTypeId) => {
            const containerType = ContainerType.loadFromStorage(containerTypeId);
            return containerType;
        });

        const unfilteredContainerTypes: (ContainerType | undefined)[] = await Promise.all(containerTypePromises);
        const containerTypes = unfilteredContainerTypes.filter(containerType => containerType !== undefined) as ContainerType[];

        this.containerTypeIds = storedAccount.containerTypeIds;
        this.containerTypes = containerTypes;
    }

    public async saveToStorage(): Promise<void> {
        const storedAccount = {
            appIds: this.appIds,
            containerTypeIds: this.containerTypeIds
        };

        const accountString = JSON.stringify(storedAccount);
        await StorageProvider.get().global.setValue(Account.storageKey, accountString);
    }

    public async deleteFromStorage(): Promise<void> {
        const secretPromises: Thenable<void>[] = [];

        this.apps.forEach(async app => {
            secretPromises.push(app.deleteFromStorage());
        });

        this.containerTypes.forEach(async containerType => {
            secretPromises.push(containerType.deleteFromStorage());
        });

        await Promise.all(secretPromises);
        await StorageProvider.get().global.setValue(Account.storageKey, undefined);
        await StorageProvider.get().global.setValue(TenantIdKey, undefined);
        await StorageProvider.get().global.setValue(TenantDomain, undefined);
    }
}

export abstract class LoginChangeListener {
    public abstract onLogin(account: Account): void;
    public abstract onLogout(): void;
}