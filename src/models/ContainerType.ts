/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import _ from 'lodash';
import { App } from "./App";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";
import { Account } from './Account';
import { ISpContainerTypeProperties, booleanToNullableBoolean, nullableBooleanToBoolean } from '../services/SpAdminProvider';
import axios from 'axios';

export enum BillingClassification {
    Paid = 0,
    FreeTrial = 1
}

// Class that represents a Container Type object persisted in the global storage provider
export class ContainerType {
    // instance properties
    public readonly containerTypeId: string;
    public readonly displayName: string;
    public readonly owningAppId: string;
    public readonly owningTenantId: string;
    public readonly billingClassification: number;
    public readonly azureSubscriptionId: string | null;
    public readonly creationDate: string | null;
    public readonly expiryDate: string | null;
    public readonly isBillingProfileRequired: boolean;
    public readonly region?: string | undefined;
    public readonly resourceGroup?: string | undefined;
    public readonly configuration: {
        applicationRedirectUrl?: string | null;
        isDiscoverablilityDisabled?: boolean | null;
        isMoveDisabled?: boolean | null;
        isRenameDisabled?: boolean | null;
        isSharingRestricted?: boolean | null;
    };

    public get isTrial(): boolean {
        return this.billingClassification === BillingClassification.FreeTrial;
    }

    public get trialDaysLeft(): number | undefined {
        if (!this.expiryDate) {
            return undefined;
        }
        const expiryDate = new Date(this.expiryDate);
        const now = new Date();
        const diff = expiryDate.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
    }

    private _owningApp?: App;
    public get owningApp(): App | undefined {
        return this._owningApp;
    }
    public async loadOwningApp(): Promise<App | undefined> {
        if (Account.get() && Account.get()!.appProvider) {
            const provider = Account.get()!.appProvider;
            this._owningApp = await provider.get(this.owningAppId);
        }
        return this._owningApp;
    }

    private _localRegistration?: ContainerTypeRegistration;
    public get localRegistration(): ContainerTypeRegistration | undefined {
        return this._localRegistration;
    }
    public async loadLocalRegistration(): Promise<ContainerTypeRegistration | undefined> {
        if (Account.get() && Account.get()!.containerTypeProvider) {
            const provider = Account.get()!.containerTypeProvider;
            this._localRegistration = await provider.getLocalRegistration(this);
        }
        return this._localRegistration;
    }

    public constructor(properties: ISpContainerTypeProperties) {
        this.azureSubscriptionId = properties.AzureSubscriptionId;
        this.displayName = properties.DisplayName;
        this.owningAppId = properties.OwningAppId;
        this.billingClassification = properties.SPContainerTypeBillingClassification;
        this.containerTypeId = properties.ContainerTypeId;
        this.owningTenantId = properties.OwningTenantId;
        this.creationDate = properties.CreationDate;
        this.expiryDate = properties.ExpiryDate;
        this.isBillingProfileRequired = properties.IsBillingProfileRequired;
        this.configuration = {
            applicationRedirectUrl: properties.Configuration.ApplicationRedirectUrl,
            isDiscoverablilityDisabled: nullableBooleanToBoolean(properties.Configuration.IsDiscoverablilityDisabled),
            isMoveDisabled: nullableBooleanToBoolean(properties.Configuration.IsMoveDisabled),
            isRenameDisabled: nullableBooleanToBoolean(properties.Configuration.IsRenameDisabled),
            isSharingRestricted: nullableBooleanToBoolean(properties.Configuration.IsSharingRestricted)
        };
    }

    public toString(): string {
        return JSON.stringify({
            AzureSubscriptionId: this.azureSubscriptionId,
            DisplayName: this.displayName,
            OwningAppId: this.owningAppId,
            SPContainerTypeBillingClassification: BillingClassification[this.billingClassification],
            ContainerTypeId: this.containerTypeId,
            OwningTenantId: this.owningTenantId,
            CreationDate: this.creationDate,
            ExpiryDate: this.expiryDate,
            IsBillingProfileRequired: this.isBillingProfileRequired,
            Region: this.region,
            ResourceGroup: this.resourceGroup,
            Configuration: {
                ApplicationRedirectUrl: this.configuration.applicationRedirectUrl,
                IsDiscoverablilityDisabled: this.configuration.isDiscoverablilityDisabled,
                IsMoveDisabled: this.configuration.isMoveDisabled,
                IsRenameDisabled: this.configuration.isRenameDisabled,
                IsSharingRestricted: this.configuration.isSharingRestricted
            }
        }, null, 4);
    }

    public get localRegistrationScope(): string {
        const account = Account.get()!;
        return `${account.spRootSiteUrl}/.default`;
    }

    public async registerOnLocalTenant(newApplicationPermissions?: ApplicationPermissions): Promise<void> {
        const account = Account.get()!;
        const app = await this.loadOwningApp();
        if (!app) {
            throw new Error(vscode.l10n.t("Unable to load owning app"));
        }
        const authProvider = await app.getAppOnlyAuthProvider(account.tenantId);
        const scope = `${account.spRootSiteUrl}/.default`;
        const accessToken = await authProvider.getToken([this.localRegistrationScope]);
        const baseUrl = `/_api/v2.1/storageContainerTypes/${this.containerTypeId}/applicationPermissions`;
        const url = `${account.spRootSiteUrl}${baseUrl}`;
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }
        };

        let existingAppPermissions: ApplicationPermissions[] | undefined;
        let appPermissions;
        if (newApplicationPermissions) {
            const containerTypeRegistration = await this.loadLocalRegistration();
            existingAppPermissions = await containerTypeRegistration!.loadApplicationPermissions();
            if (existingAppPermissions) {
                const index = existingAppPermissions.findIndex(
                    permission => permission.appId === newApplicationPermissions.appId
                );
        
                if (index !== -1) {
                    // Update the existing permission
                    existingAppPermissions[index] = newApplicationPermissions;
                } else {
                    // Add the new permission
                    existingAppPermissions.push(newApplicationPermissions);
                }
                appPermissions = existingAppPermissions.map((permission) => ({
                    appId: permission.appId,
                    delegated: permission.delegated,
                    appOnly: permission.appOnly
                }));
            }
        } else {
            appPermissions = [{
                appId: app.clientId,
                delegated: ['full'],
                appOnly: ['full']
            }];
        }

        const body = {
            value: appPermissions
        };
        return axios.put(url, JSON.stringify(body), options);
    }
}
