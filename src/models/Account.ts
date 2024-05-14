/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore
import * as vscode from 'vscode';
// @ts-ignore
import { AccountInfo } from '@azure/msal-node';
import FirstPartyAuthProvider from '../services/1PAuthProvider';
import { BaseAuthProvider } from '../services/BaseAuthProvider';
import { checkJwtForAdminClaim, decodeJwt } from '../utils/token';
import { StorageProvider } from '../services/StorageProvider';
import GraphProvider from '../services/GraphProvider';
import SPAdminProvider from '../services/SPAdminProvider';
import { clientId, containerTypeManagementAppId } from '../client';
import ContainerTypeProvider from '../services/ContainerTypeProvider';
import SpAdminProviderNew from '../services/SpAdminProviderNew';
import AppProvider from '../services/AppProvider';
import { GraphProviderNew } from '../services/GraphProviderNew';
import ARMProvider from '../services/ARMProvider';


// Account class that represents an msal AccountInfo object from the FirstPartyAuthProvider
export class Account {
    // Storage key for the account
    public static readonly storageKey: string = "account";
    private static readonly authProvider: BaseAuthProvider = new FirstPartyAuthProvider(clientId, Account.storageKey);
    //private static readonly scopes: string[] = ['Application.ReadWrite.All', 'User.Read', 'Sites.Read.All'];
    private static readonly graphScopes: string[] = ['https://graph.microsoft.com/.default']; // ['Application.ReadWrite.All', 'User.Read', 'Sites.Read.All'];
    private static readonly spScopes: string[] = ['https://microsoft.sharepoint.com/.default']; // ['AllSites.FullControl']
    private static readonly armScopes: string[] = ['https://management.azure.com/.default']; // ['https://management.azure.com/user_impersonation']
    //private static readonly _spAdminAuthProvider: BaseAuthProvider = new FirstPartyAuthProvider(containerTypeManagementAppId, containerTypeManagementAppId);
    //private static readonly _armAuthProvider: BaseAuthProvider = new FirstPartyAuthProvider(containerTypeManagementAppId, 'arm');
    public static readonly graphProvider: GraphProviderNew = new GraphProviderNew(Account.authProvider);

    private static instance: Account | undefined;
    private static subscribers: LoginChangeListener[] = [];
    private static readonly storage: StorageProvider;

    public readonly tenantId: string;
    public readonly username: string;
    public readonly name?: string;
    public readonly isAdmin: boolean;
    public readonly domain: string;
    public readonly spRootSiteUrl: string;
    public readonly spAdminSiteUrl: string;

    private get appSetStorageKey(): string {
        return `${this.tenantId}-${this.username}-appIds`;
    }
    private _getAppSecretKey(appId: string): string {
        return `${this.tenantId}-${appId}`;
    }
    public async getAppSecrets(appId: string): Promise<StoredAppSecrets> {
        const secretsJson = await StorageProvider.get().secrets.get(this._getAppSecretKey(appId));
        if (secretsJson) {
            return JSON.parse(secretsJson) as StoredAppSecrets;
        }
        return {};
    }
    public setAppSecrets(appId: string, secrets: StoredAppSecrets): void {
        StorageProvider.get().secrets.store(this._getAppSecretKey(appId), JSON.stringify(secrets));
    }
    public deleteAppSecrets(appId: string): void {
        StorageProvider.get().secrets.delete(this._getAppSecretKey(appId));
    }

    public readonly containerTypeProvider: ContainerTypeProvider;
    public readonly appProvider: AppProvider;
    public readonly armProvider: ARMProvider;

    private constructor(props: AccountCreationProperties) {
        this.tenantId = props.tenantId;
        this.username = props.username;
        this.name = props.name;
        this.isAdmin = props.isAdmin;
        this.domain = props.domain;
        this.spRootSiteUrl = props.spRootSiteUrl;
        this.spAdminSiteUrl = props.spAdminSiteUrl;

        const spAdminProvider = new SpAdminProviderNew(Account.authProvider, this.spAdminSiteUrl);
        this.containerTypeProvider = new ContainerTypeProvider(spAdminProvider);
        this.appProvider = new AppProvider(Account.graphProvider);
        this.armProvider = new ARMProvider(Account.authProvider);
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
        Account._notifyBeforeLogin();
        let graphToken: string;
        let spToken: string;
        let armToken: string;
        try {
            graphToken = await Account.authProvider.getToken(Account.graphScopes);
            if (!graphToken) {
                throw new Error('access token empty');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get access token: ${error}`);
            Account._notifyLoginFailed();
            return;
        }
        
        let domain: string;
        let spRootSiteUrl: string;
        let spAdminSiteUrl: string;
        try {
            const spUrls = await Account.graphProvider.getSpUrls();
            if (!spUrls) {
                throw new Error('root site url empty');
            }
            spRootSiteUrl = spUrls.root;
            spAdminSiteUrl = spUrls.admin;
            domain = new URL(spRootSiteUrl).hostname.split('.')[0];
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get root site: ${error}`);
            Account._notifyLoginFailed();
            return;
        }

        const accountInfo = await Account._getSavedAccount();
        if (!accountInfo) {
            Account._notifyLoginFailed();
            return;
        }

        const decodedToken = decodeJwt(graphToken);
        const isAdmin = checkJwtForAdminClaim(decodedToken);

        const accountProps: AccountCreationProperties = {
            ...accountInfo,
            isAdmin,
            domain,
            spRootSiteUrl,
            spAdminSiteUrl
        };
        const account = new Account(accountProps);
        Account.instance = account;
        Account._notifyLogin();
        return account;
    }

    public async logout(): Promise<void> {
        await Account.authProvider.logout();
        //wait Account._spAdminAuthProvider.logout();

        StorageProvider.get().secrets.clear();
        await StorageProvider.get().secrets.delete('account');
        await StorageProvider.get().secrets.delete(containerTypeManagementAppId);
        StorageProvider.get().global.getAllKeys().forEach(async (key) => {
            await StorageProvider.get().global.setValue(key, undefined);    
        });
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
    
    private static _notifyBeforeLogin(): void {
        Account.subscribers.forEach((listener) => {
            if (listener.onBeforeLogin) {
                listener.onBeforeLogin();
            }
        });
    }

    private static _notifyLogin(): void {
        Account.subscribers.forEach((listener) => {
            if (listener.onLogin) {
                listener.onLogin(Account.get()!);
            }
        });
    }

    private static _notifyLoginFailed(): void {
        Account.subscribers.forEach((listener) => {
            if (listener.onLoginFailed) {
                listener.onLoginFailed();
            }
        });
    }

    private static _notifyLogout(): void {
        Account.subscribers.forEach((listener) => {
            if (listener.onLogout) {
                listener.onLogout();
            }
        });
    }
}

export abstract class LoginChangeListener {
    public abstract onBeforeLogin?(): void;
    public abstract onLogin?(account: Account): void;
    public abstract onLoginFailed?(): void;
    public abstract onLogout?(): void;
}

interface AccountCreationProperties extends AccountInfo {
    isAdmin: boolean;
    domain: string;
    spRootSiteUrl: string;
    spAdminSiteUrl: string;
}

type StoredAppSecrets = {
    clientSecret?: string;
    thumbprint?: string;
    privateKey?: string;
};
