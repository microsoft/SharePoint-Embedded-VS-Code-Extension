import * as path from 'path';
import * as temp from 'temp';
import { ExtensionContext, Uri, SecretStorage, Event, SecretStorageChangeEvent } from 'vscode';

export class MockExtensionContext implements ExtensionContext {
    extensionPath: string;
    workspaceState = new InMemoryMemento();
    globalState = new InMemoryMemento();
    secrets = new (class implements SecretStorage {
        get(key: string): Thenable<string | undefined> {
            return Promise.resolve("");
        }
        store(key: string, value: string): Thenable<void> {
            return Promise.resolve();
        }
        delete(key: string): Thenable<void> {
            return Promise.resolve();
        }
        onDidChange!: Event<SecretStorageChangeEvent>;
    })();
    subscriptions: { dispose(): any }[] = [];

    storagePath: string;
    globalStoragePath: string;
    logPath: string;
    extensionUri: Uri = Uri.file(path.resolve(__dirname, '..'));
    environmentVariableCollection: any;
    extensionMode: any;

    logUri: Uri;

    storageUri: Uri;

    globalStorageUri: Uri;

    extensionRuntime: any;
    extension: any;
    isNewInstall: any;

    constructor() {
        this.extensionPath = path.resolve(__dirname, '..');
        this.extensionUri = Uri.file(this.extensionPath);
        this.storagePath = temp.mkdirSync('storage-path');
        this.storageUri = Uri.file(this.storagePath);
        this.globalStoragePath = temp.mkdirSync('global-storage-path');
        this.globalStorageUri = Uri.file(this.globalStoragePath);
        this.logPath = temp.mkdirSync('log-path');
        this.logUri = Uri.file(this.logPath);
    }

    asAbsolutePath(relativePath: string): string {
        return path.resolve(this.extensionPath, relativePath);
    }

    dispose() {
        this.subscriptions.forEach(sub => sub.dispose());
    }
}

import { Memento } from 'vscode';

export class InMemoryMemento implements Memento {
    private _storage: { [keyName: string]: any } = {};

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: string, defaultValue?: any) {
        return this._storage[key] || defaultValue;
    }

    update(key: string, value: any): Thenable<void> {
        this._storage[key] = value;
        return Promise.resolve();
    }

    keys(): readonly string[] {
        return Object.keys(this._storage);
    }

    setKeysForSync(keys: string[]): void { }
}