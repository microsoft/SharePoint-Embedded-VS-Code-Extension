/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios, { AxiosResponse } from "axios";
import { ARMAuthProvider } from "./Auth";
import { v4 as uuidv4 } from 'uuid';
import {
    ArmSubscription,
    ArmResourceGroup,
    ArmSyntexProvider,
    ArmAccount,
    ArmAccountCreate,
    ArmSubscriptionsResponse,
    ArmResourceGroupsResponse,
    ArmAccountsResponse,
    armSubscriptionSchema,
    armResourceGroupSchema,
    armSyntexProviderSchema,
    armAccountSchema,
    armSubscriptionsResponseSchema,
    armResourceGroupsResponseSchema,
    armAccountsResponseSchema
} from '../models/schemas';

export default class ARMProvider {
    private readonly _baseApiUrl;
    private readonly _scopes;

    public constructor(private _authProvider: ARMAuthProvider) {
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

    public async getSubscriptions(): Promise<ArmSubscription[]> {
        const response = await this._sendGetRequest(`subscriptions`, `api-version=2021-04-01`);
        const validated = armSubscriptionsResponseSchema.parse(response.data);
        return validated.value;
    }

    public async getSubscriptionById(subscriptionId: string): Promise<ArmSubscription> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}`, `api-version=2021-04-01`);
        return armSubscriptionSchema.parse(response.data);
    }
    
    public async getSubscriptionResourceGroups(subscriptionId: string): Promise<ArmResourceGroup[]> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}/resourceGroups`, `api-version=2021-04-01`);
        const validated = armResourceGroupsResponseSchema.parse(response.data);
        return validated.value;
    }

    public async getSyntexProvider(subscriptionId: string): Promise<ArmSyntexProvider> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}/providers/Microsoft.Syntex`, `api-version=2021-04-01`);
        return armSyntexProviderSchema.parse(response.data);
    }

    public async createSyntexProvider(subscriptionId: string): Promise<ArmSyntexProvider> {
        const response = await this._sendPostRequest(`subscriptions/${subscriptionId}/providers/Microsoft.Syntex/register`, {}, `api-version=2021-04-01`);
        return armSyntexProviderSchema.parse(response.data);
    }

    public async getArmAccounts(subscriptionId: string, resourceGroup: string): Promise<ArmAccount[]> {
        const response = await this._sendGetRequest(`subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Syntex/accounts`, `api-version=2023-01-04-preview`);
        const validated = armAccountsResponseSchema.parse(response.data);
        return validated.value;
    }

    public async createArmAccount(subscriptionId: string, resourceGroup: string, region: string, containerTypeId: string): Promise<ArmAccount> {
        const accountCreate: ArmAccountCreate = {
            location: region,
            properties: {
                friendlyName: `CT_${containerTypeId}`,
                service: 'SPO',
                identityType: 'ContainerType',
                identityId: containerTypeId,
                feature: 'RaaS',
                scope: 'Global'
            }
        };
        const response = await this._sendPutRequest(`subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Syntex/accounts/${uuidv4()}`, accountCreate, `api-version=2023-01-04-preview`);
        return armAccountSchema.parse(response.data);
    }

    /**
     * Validate ARM subscription data against schema
     */
    public validateSubscription(data: unknown): ArmSubscription {
        return armSubscriptionSchema.parse(data);
    }

    /**
     * Validate ARM resource group data against schema
     */
    public validateResourceGroup(data: unknown): ArmResourceGroup {
        return armResourceGroupSchema.parse(data);
    }

    /**
     * Validate ARM account data against schema
     */
    public validateAccount(data: unknown): ArmAccount {
        return armAccountSchema.parse(data);
    }

    /**
     * Safely validate ARM subscription collection response
     */
    public validateSubscriptionsResponse(data: unknown): ArmSubscriptionsResponse {
        return armSubscriptionsResponseSchema.parse(data);
    }

    /**
     * Safely validate ARM resource groups collection response
     */
    public validateResourceGroupsResponse(data: unknown): ArmResourceGroupsResponse {
        return armResourceGroupsResponseSchema.parse(data);
    }

    /**
     * Safely validate ARM accounts collection response
     */
    public validateAccountsResponse(data: unknown): ArmAccountsResponse {
        return armAccountsResponseSchema.parse(data);
    }
}