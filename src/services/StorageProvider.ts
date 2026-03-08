/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { Event, Memento, SecretStorage, SecretStorageChangeEvent } from "vscode";
import { ext } from '../utils/extensionVariables';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class StorageProvider {
    private static instance: StorageProvider;
    public readonly global: LocalStorageService;
    public readonly local: LocalStorageService;
    public readonly secrets: IEnumerableSecretStorage;
    public readonly temp: Map<string, any> = new Map<string, any>();

    private constructor(global: LocalStorageService, local: LocalStorageService, secrets: SecretStorage) {
        this.global = global;
        this.local = local;
        this.secrets = new EnumerableSecretStorage(secrets, global);
    }

    public static init(global: LocalStorageService, local: LocalStorageService, secrets: SecretStorage): StorageProvider {
        StorageProvider.instance = new StorageProvider(global, local, secrets);
        return StorageProvider.instance;
    }
    public static get(): StorageProvider {
        if (!StorageProvider.instance) {
            throw new Error("StorageProvider not yet initialized. Call init() with required services");
        }
        return StorageProvider.instance;
    }

    public static async purgeOldCache() {
        const storage = StorageProvider.get();

        // Clear old account global state and per-app secrets
        try {
            const account: {appIds?: string[], containerTypeIds?: string[]} = JSON.parse(storage.global.getValue('account'));

            if (account && account.appIds) {
                for (const appId of account.appIds || []) {
                    await storage.secrets.delete(appId);
                }
            }
            await storage.global.setValue('account', undefined);
        } catch (error) {
            // No old account data — ignore
        }

        try {
            await storage.secrets.delete('account');
        } catch (error) {
            // Ignore
        }

        // Clear old MSAL token cache stored under the clientId keys.
        // The old extension used CacheFactory to persist MSAL token caches
        // in SecretStorage keyed by the clientId — these are not tracked in
        // spe:secretKeys, so we must delete them directly.
        const oldClientIds = [
            'f3dc316d-b1e5-4f9a-8cfa-ea5a6b874a48',  // old 1P client ID
            '63c00075-8c18-4247-b85d-0296f2b0f339',  // current client ID (old MSAL cache)
        ];
        for (const id of oldClientIds) {
            try {
                await storage.secrets.delete(id);
            } catch (error) {
                // Ignore
            }
        }
    }
}

export class LocalStorageService {
    
    constructor(private _storage: Memento) { }   
    
    public getValue<T>(key : string) : T {
        return this._storage.get<T>(key, null as unknown as T);
    }

    public async setValue<T>(key : string, value : T) {
        await this._storage.update(key, value );
    }

    public getAllKeys(): readonly string[] {
        return this._storage.keys();
    }
}

export interface IEnumerableSecretStorage extends SecretStorage {
    keys(): string[];
    clear(): void;
}

class EnumerableSecretStorage implements IEnumerableSecretStorage {
    
    constructor (private _secrets: SecretStorage, private _global: LocalStorageService) { }
    
    private get globalSetKey(): string {
        return 'spe:secretKeys';
    }
    
    private _getGlobalSet(): Set<string> {
        const globalSetArrayJson = this._global.getValue<string>(this.globalSetKey);
        try {
            const globalSetArray = JSON.parse(globalSetArrayJson) as string[];
            return new Set<string>(globalSetArray || []);
        } catch (error) {
            this._global.setValue(this.globalSetKey, undefined);
            return new Set<string>();
        }        
    }

    private _setGlobalSet(value: Set<string>) {
        const globalSetArray = Array.from(value);
        const globalSetArrayJson = JSON.stringify(globalSetArray);
        this._global.setValue<string>(this.globalSetKey, globalSetArrayJson);
    }

    private _addSecretKey(key: string) {
        let globalSet = this._getGlobalSet();
        globalSet.add(key);
        this._setGlobalSet(globalSet);
    }

    private _removeSecretKey(key: string) {
        let globalSet = this._getGlobalSet();
        globalSet.delete(key);
        this._setGlobalSet(globalSet);
    }

    public store(key: string, value: string): Thenable<void> {
        this._addSecretKey(key);
        return this._secrets.store(key, value);
    }

    public delete(key: string): Thenable<void> {
        this._removeSecretKey(key);
        return this._secrets.delete(key);
    }

    public keys(): string[] {
        let globalSet = this._getGlobalSet();
        return Array.from(globalSet);
    }

    public clear(): void {
        let keys = this.keys();
        for (const key of keys) {
            this._secrets.delete(key);
        }
        this._global.setValue(this.globalSetKey, undefined);
    }

    public get(key: string): Thenable<string | undefined> {
        return this._secrets.get(key);
    }

    public onDidChange: Event<SecretStorageChangeEvent> = this._secrets.onDidChange;
}


