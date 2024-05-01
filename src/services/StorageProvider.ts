/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { Event, Memento, SecretStorage, SecretStorageChangeEvent } from "vscode";

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
        console.log(`globalSetArrayJson: ${globalSetArrayJson}`);
        try {
            const globalSetArray = JSON.parse(globalSetArrayJson) as string[];
            return new Set<string>(globalSetArray || []);
        } catch (error) {
            console.log(`Unable to parse secret key set: ${error}`);
            this._global.setValue(this.globalSetKey, undefined);
            return new Set<string>();
        }        
    }

    private _setGlobalSet(value: Set<string>) {
        const globalSetArray = Array.from(value);
        const globalSetArrayJson = JSON.stringify(globalSetArray);
        console.log(`globalSetArrayJson: ${globalSetArrayJson}`);
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
        console.log(`store called with key: ${key} and value: ${value}`);
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


