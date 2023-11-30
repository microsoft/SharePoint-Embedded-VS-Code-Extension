/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { Memento, SecretStorage } from "vscode";

export class StorageProvider {
    private static instance: StorageProvider
    public readonly global: LocalStorageService;
    public readonly local: LocalStorageService;
    public readonly secrets: SecretStorage;
    public readonly temp: Map<string, any> = new Map<string, any>();

    public constructor(global: LocalStorageService, local: LocalStorageService, secrets: SecretStorage) {
        this.global = global;
        this.local = local;
        this.secrets = secrets;
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
    
    constructor(private storage: Memento) { }   
    
    public getValue<T>(key : string) : T {
        return this.storage.get<T>(key, null as unknown as T);
    }

    public async setValue<T>(key : string, value : T) {
        await this.storage.update(key, value );
    }

    public getAllKeys(): readonly string[] {
        return this.storage.keys();
    }
}