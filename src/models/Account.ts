/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore
import { AccountInfo } from '@azure/msal-node';
import FirstPartyAuthProvider from '../services/1PAuthProvider';
import { BaseAuthProvider } from '../services/BaseAuthProvider';
import { checkJwtForAdminClaim, decodeJwt } from '../utils/token';
import { App } from './App';
import { StorageProvider } from '../services/StorageProvider';


// Account class that represents an msal AccountInfo object from the FirstPartyAuthProvider
export class Account {
    // Storage key for the account
    private static readonly storageKey: string = "1P";
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

    public apps: App[] = [];

    private constructor(homeAccountId: string, environment: string, tenantId: string, username: string, localAccountId: string, isAdmin: boolean, name?: string) {
        this.homeAccountId = homeAccountId;
        this.environment = environment;
        this.tenantId = tenantId;
        this.username = username;
        this.localAccountId = localAccountId;
        this.name = name;
        this.isAdmin = isAdmin;
    }

    public static get(): Account | undefined {
        return Account.instance;
    }

    public static isLoggedIn(): boolean {
        return Account.instance !== undefined;
    }

    public static async hasSavedAccount(): Promise<boolean> {
        const accountInfo = await Account.getSavedAccount();
        return accountInfo !== undefined;
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

    public static async logout(): Promise<void> {
        await Account.authProvider.logout();
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

    public async createApp(appName: string): Promise<App | undefined> {
        const token = await Account.authProvider.getToken(Account.scopes);
        if (token) {
            return await App.create(appName, token);
        }
        return undefined;
    }
}

export abstract class AccountChangeListener {
    public abstract onLogin(account: Account): void;
    public abstract onLogout(): void;
}
