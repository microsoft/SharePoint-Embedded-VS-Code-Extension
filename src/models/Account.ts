/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore
import { AccountInfo, ProtocolMode } from '@azure/msal-node';
import FirstPartyAuthProvider from '../services/1PAuthProvider';
import { BaseAuthProvider } from '../services/BaseAuthProvider';
import { checkJwtForAdminClaim, decodeJwt, getJwtTenantId } from '../utils/token';
import { App } from './App';
import { StorageProvider } from '../services/StorageProvider';
import { BillingClassification, ContainerType } from './ContainerType';
import { generateCertificateAndPrivateKey, createCertKeyCredential } from '../cert';
import GraphProvider from '../services/GraphProvider';
import ThirdPartyAuthProvider from '../services/3PAuthProvider';
import PnPProvider from '../services/PnPProvider';
import { TenantIdKey, OwningAppIdKey } from '../utils/constants';
import { ApplicationPermissions } from './ApplicationPermissions';
import { ContainerTypeRegistration } from './ContainerTypeRegistration';

type StoredAccount = {
    appIds: string[],
    containerTypeIds: string[]
}

type AccountData = {
    apps: App[]
    containerTypes: ContainerType[]
}


// Account class that represents an msal AccountInfo object from the FirstPartyAuthProvider
export class Account {
    // Storage key for the account
    public static readonly storageKey: string = "account";
    private static readonly firstPartyAppId: string = "aba7eb80-02fe-4070-8fca-b729f428166f";
    private static readonly authProvider: BaseAuthProvider = new FirstPartyAuthProvider(Account.firstPartyAppId, Account.storageKey);
    private static readonly scopes: string[] = ['Application.ReadWrite.All', 'User.Read'];
    private static instance: Account | undefined;
    private static subscribers: AccountChangeListener[] = [];
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

        this.loadFromStorage()
    }

    public static get(): Account | undefined {
        return Account.instance;
    }

    public static isLoggedIn(): boolean {
        return Account.instance !== undefined;
    }

    public static async hasSavedAccount(): Promise<boolean> {
        const accountInfo = await Account.getSavedAccount();
        return accountInfo !== undefined && accountInfo !== null;
    }

    private static async getSavedAccount(): Promise<AccountInfo | null> {
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
            const accountInfo = await Account.getSavedAccount();
            if (accountInfo) {
                const decodedToken = decodeJwt(token);
                const isAdmin = checkJwtForAdminClaim(decodedToken);
                const tid = getJwtTenantId(decodedToken)
                Account.instance = new Account(accountInfo.homeAccountId,
                    accountInfo.environment,
                    accountInfo.tenantId,
                    accountInfo.username,
                    accountInfo.localAccountId,
                    isAdmin,
                    accountInfo.name
                );
                Account.notifyLogin();
                return Account.get();
            }

        }
        return undefined;
    }

    public async logout(): Promise<void> {
        await Account.authProvider.logout();
        await this.deleteFromStorage();
        Account.instance = undefined;
        Account.notifyLogout();
    }

    public static subscribe(listener: AccountChangeListener): void {
        Account.subscribers.push(listener);
    }

    public static unsubscribe(listener: AccountChangeListener): void {
        const index = Account.subscribers.indexOf(listener);
        if (index > -1) {
            Account.subscribers.splice(index, 1);
        }
    }

    private static notifyLogin(): void {
        Account.subscribers.forEach((listener) => {
            listener.onLogin(Account.get()!);
        });
    }

    private static notifyLogout(): void {
        Account.subscribers.forEach((listener) => {
            listener.onLogout();
        });
    }

    public async createApp(appName: string, isOwningApp: boolean): Promise<App | undefined> {
        const token = await Account.authProvider.getToken(Account.scopes);
        if (token) {
            const app = await Account.createApp(appName, token, isOwningApp);
            if (app) {
                // Save updated app IDs to storage
                this.appIds.push(app.clientId);
                this.apps.push(app);
                await this.saveToStorage()
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
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)

        //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);

        // Create ContainerType if none exist in global store, else register application on existing ContainerType
        if (this.containerTypeIds.length === 0) {
            const containerTypeDetails = await PnPProvider.createNewContainerType(spToken, domain, appId, containerTypeName, billingClassification);
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
    }

    public async getContainerTypeById(appId: string, containerTypeId: string): Promise<ContainerType | undefined> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return undefined;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)
        const tid: any = StorageProvider.get().global.getValue(TenantIdKey);

        //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
        const containerTypeDetails = await PnPProvider.getContainerTypeById(spToken, domain, containerTypeId);

        return containerTypeDetails;
    }

    public async getAllContainerTypes(appId: string): Promise<ContainerType[]> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return [];
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)
        const tid: any = StorageProvider.get().global.getValue(TenantIdKey);

        //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);
        const containerTypeList = await PnPProvider.getContainerTypes(spToken, domain);
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
    }

    public async deleteContainerTypeById(appId: string, containerTypeId: string): Promise<ContainerType | undefined> {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return undefined;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)

        //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/AllSites.Write`]);

        const containerTypeDetails = await PnPProvider.deleteContainerTypeById(spToken, domain, containerTypeId);

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
    }

    private static async createApp(displayName: string, token: string, isOwningApp: boolean): Promise<App | undefined> {
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
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(app.clientId, appSecrets.thumbprint, appSecrets.privateKey)

            //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

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

    public async loadFromStorage(): Promise<void> {
        const storedAccount: StoredAccount = JSON.parse(StorageProvider.get().global.getValue(Account.storageKey));

        if (!storedAccount)
            return;

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
        }

        const accountString = JSON.stringify(storedAccount);
        await StorageProvider.get().global.setValue(Account.storageKey, accountString);
    }

    public async deleteFromStorage(): Promise<void> {
        const secretPromises: Thenable<void>[] = [];

        this.apps.forEach(async app => {
            secretPromises.push(app.deleteFromStorage());
        })

        this.containerTypes.forEach(async containerType => {
            secretPromises.push(containerType.deleteFromStorage());
        })

        await Promise.all(secretPromises);
        await StorageProvider.get().global.setValue(Account.storageKey, undefined);
    }
}

export abstract class AccountChangeListener {
    public abstract onLogin(account: Account): void;
    public abstract onLogout(): void;
}
