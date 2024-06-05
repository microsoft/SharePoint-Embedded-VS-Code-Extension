/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios, { AxiosResponse } from "axios";
import { BaseAuthProvider } from "./BaseAuthProvider";
import { v4 as uuidv4 } from 'uuid';

export default class ARMProvider {
    private readonly _baseApiUrl;
    private readonly _scopes;

    public constructor(private _authProvider: BaseAuthProvider) {
        this._baseApiUrl = 'https://management.azure.com/';
        this._scopes = [`${this._baseApiUrl}/user_impersonation`];
    }

    private async _sendGetRequest(method: string, qsp: string): Promise<AxiosResponse> {
        const accessToken = await this._authProvider.getToken(this._scopes);
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }
        };
        const url = `${this._baseApiUrl}${method}?${qsp}`;
        return axios.get(url, options);
    }

    private async _sendPostRequest(method: string, body: any, qsp: string): Promise<AxiosResponse> {
        const accessToken = await this._authProvider.getToken(this._scopes);
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }
        };
        const url = `${this._baseApiUrl}${method}?${qsp}`;
        return axios.post(url, JSON.stringify(body), options);
    }

    private async _sendPutRequest(method: string, body: any, qsp: string): Promise<AxiosResponse> {
        const accessToken = await this._authProvider.getToken(this._scopes);
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }
        };
        const url = `${this._baseApiUrl}${method}?${qsp}`;
        return axios.put(url, JSON.stringify(body), options);
    }

    public async getSubscriptions(): Promise<IArmSubscriptionProperties[]> {
        const response = await this._sendGetRequest(`subscriptions`, `api-version=2021-04-01`);
        return response.data.value as IArmSubscriptionProperties[];
    }

    public async getSubscriptionById(subscriptionId: string): Promise<IArmSubscriptionProperties> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}`, `api-version=2021-04-01`);
        return response.data as IArmSubscriptionProperties;
    }
    
    public async getSubscriptionResourceGroups(subscriptionId: string): Promise<IArmResourceGroupProperties[]> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}/resourceGroups`, `api-version=2021-04-01`);
        return response.data.value as IArmResourceGroupProperties[];
    }

    public async getSyntexProvider(subscriptionId: string): Promise<IArmSyntexProviderProperties> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}/providers/Microsoft.Syntex`, `api-version=2021-04-01`);
        return response.data as IArmSyntexProviderProperties;
    }

    public async createSyntexProvider(subscriptionId: string, body: any): Promise<IArmSyntexProviderProperties> {
        const response = await this._sendPostRequest(`subscriptions/${subscriptionId}/providers/Microsoft.Syntex/register`, {}, `api-version=2021-04-01`);
        return response.data as IArmSyntexProviderProperties;
    }

    public async getArmAccounts(subscriptionId: string, resourceGroup: string): Promise<any> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Syntex/accounts`, `api-version=2023-01-04-preview`);
        return response.data.value as IArmAccountProperties[];
    }

    public async createArmAccount(subscriptionId: string, resourceGroup: string, region: string, containerTypeId: string) {
        const body = {
            location: region,
            properties: {
                friendlyName: `CT_${containerTypeId}`,
                service: 'SPO',
                identityType: 'ContainerType',
                identityId: `${containerTypeId}`,
                feature: 'RaaS',
                scope: 'Global'
            }
        };
        const response = await this._sendPutRequest(`subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Syntex/accounts/${uuidv4()}`, body, `api-version=2023-01-04-preview`);
        return response.data as IArmAccountProperties;
    }
}

export interface IArmAccountProperties {
    id: string;
    location: string;
    name: string;
    type: string;
    properties: IArmAccountPropertiesBag;
    systemData: IArmAccountSystemData;
}

export interface IArmAccountPropertiesBag {
    friendlyName: string;
    identityId: string;
    identityType: string;
    provisioningState: string;
    feature: string;
    scope: string;
    service: string;
}

export interface IArmAccountSystemData {    
    createdBy: string;
    createdByType: string
    createdAt: string;
    lastModifiedAt: string;
    lastModifiedBy: string;
    lastModifiedByType: string
}

export interface IArmSyntexProviderProperties {
    id: string;
    namespace: string;
    registrationState: string;
    authorizations: any[];
    resourceTypes: any[];
    registrationPolicy: string;
}

export interface IArmSubscriptionProperties {
    id: string;
    authorizationSource: string;
    managedByTenants: string[];
    subscriptionId: string;
    subscriptionPolicies: IArmSubscriptionPolicyProperties;
    tenantId: string;
    displayName: string;
    state: string;
}

export interface IArmSubscriptionPolicyProperties {
    locationPlacementId: string;
    quotaId: string;
    spendingLimit: string;
    quotaPeriod: string;
    spendingLimitPerSubscription: string;
    spendingLimitPerSubscriptionPeriod: string;
    quotaPeriodType: string;
    spendingLimitPerSubscriptionPeriodType: string;
}

export interface IArmResourceGroupProperties { 
    id: string;
    location: string;
    managedBy: string;
    name: string;
    properties: IArmResourceGroupPropertiesBag;
    tags: string;
}

export interface IArmResourceGroupPropertiesBag {
    provisioningState: string;
}