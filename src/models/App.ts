/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, RequiredResourceAccess } from "@microsoft/microsoft-graph-types";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";
import _ from 'lodash';
import { Account } from "./Account";
import { GraphProviderNew } from "../services/GraphProviderNew";
import AppOnly3PAuthProvider, { IAppOnlyCredential } from "../services/AppOnly3PAuthProvider";

// Class that represents an Azure AD application
export class App {
    private _account: Account;

    public readonly clientId: string;
    public readonly displayName: string;
    public readonly objectId: string;
    public readonly requiredResourceAccess: RequiredResourceAccess[];
    public get name(): string {
        return this.displayName || this.clientId;
    }

    public async getSecrets(): Promise<AppCredentials> {
        return await this._account.getAppSecrets(this.clientId);
    }
    public async setSecrets(value: AppCredentials): Promise<void> {
        const secrets = await this.getSecrets();
        const updated = {
            ...secrets,
            ...value
        };
        this._account.setAppSecrets(this.clientId, updated);
    }

    public async hasCert(): Promise<boolean> {
        const secrets = await this.getSecrets();
        return !!secrets.thumbprint && !!secrets.privateKey;
    }

    public async hasSecret(): Promise<boolean> {
        const secrets = await this.getSecrets();
        return !!secrets.clientSecret;
    }

    public constructor (config: Application) {
        this.clientId = config.appId!;
        this.displayName = config.displayName!;
        this.objectId = config.id!;
        this.requiredResourceAccess = config.requiredResourceAccess!;

        this._account = Account.get()!;
    }

    private _appOnlyAuthProviders: Map<string, AppOnly3PAuthProvider> = new Map<string, AppOnly3PAuthProvider>();
    public async getAppOnlyAuthProvider(tenantId: string): Promise<AppOnly3PAuthProvider> {
        let mapKey = tenantId;
        const secrets = await this.getSecrets();
        let cred: IAppOnlyCredential | undefined;
        if (secrets.thumbprint && secrets.privateKey) {
            cred = {
                clientCertificate: {
                    privateKey: secrets.privateKey,
                    thumbprint: secrets.thumbprint
                }
            };
            mapKey += '-cert';
        } else if (secrets.clientSecret) {
            cred = { clientSecret: secrets.clientSecret };
            mapKey += '-secret';
        } else {
            throw new Error('App is missing credentials');
        }
        if (!this._appOnlyAuthProviders.has(mapKey)) {
            this._appOnlyAuthProviders.set(mapKey, new AppOnly3PAuthProvider(this.clientId, tenantId, cred));
        }
        return this._appOnlyAuthProviders.get(mapKey)!;
    }

    public removeAppOnlyAuthProvider(tenantId: string): void {
        this._appOnlyAuthProviders.delete(tenantId);
    }

    public checkRequiredResourceAccess(resource: string, scopeOrRole: string): boolean {
        if (!this || !scopeOrRole || !resource) {
            return false;
        }

        const appId = this.clientId;
        if (!appId) {
            return false;
        }

        const resourceAccess = this.requiredResourceAccess;
        if (!resourceAccess) {
            return false;;
        }

        const resourceAppPermissions = resourceAccess.filter((resourceAccess) => resourceAccess.resourceAppId === resource);
        if (!resourceAppPermissions) {
            return false;
        }

        let hasScopeOrRole = false;
        resourceAppPermissions.forEach((resourceAppPermission) => {
            const resources = resourceAppPermission.resourceAccess?.filter((resourceAccess) => resourceAccess && resourceAccess.id === scopeOrRole);
            if (resources && resources.length > 0) {
            hasScopeOrRole = true;
            }
        });
        return hasScopeOrRole;
    }
}

export type AppCredentials = {
    clientSecret?: string;
    thumbprint?: string;
    privateKey?: string;
};

export enum AppType {
    OwningApp,
    GuestApp
}