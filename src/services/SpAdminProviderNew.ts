/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios, { AxiosResponse } from 'axios';
import { BillingClassification, ContainerType } from '../models/ContainerType';
import { BaseAuthProvider } from './BaseAuthProvider';

export default class SpAdminProviderNew {
    private readonly _baseApiUrl;
    private readonly _scopes;

    public constructor(private _authProvider: BaseAuthProvider, private _spAdminUrl: string) {
        this._baseApiUrl = `${this._spAdminUrl}/_api/SPO.Tenant/`;
        this._scopes = [`${this._spAdminUrl}/AllSites.Read`];
        //this._scopes = [`00000003-0000-0ff1-ce00-000000000000/AllSites.Write`];
    }

    private async _sendPostRequest(method: string, body: any): Promise<AxiosResponse> {
        const accessToken = await this._authProvider.getToken(this._scopes);
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }
        };
        const url = `${this._baseApiUrl}${method}`;
        console.log(url);
        console.log(options);
        console.log(body);
        return axios.post(url, JSON.stringify(body), options);
    }

    public async listContainerTypes(): Promise<ISpContainerTypeProperties[]> {
        const method = 'GetSPOContainerTypes';
        const body = {
            containerTenantType: 1
        };
        const response = await this._sendPostRequest(method, body);
        return response.data.value as ISpContainerTypeProperties[];

    }

    public async getContainerType(containerTypeId: string): Promise<ISpContainerTypeProperties> {
        const method = 'GetSPOContainerTypeById';
        const body = {
            containerTypeId,
            containerTenantType: 1
        };
        const response = await this._sendPostRequest(method, body);
        return response.data as ISpContainerTypeProperties;
    }

    public async getConsumingApplication(owningAppId: string, appId?: string): Promise<ISpConsumingApplicationProperties> {
        const method = 'GetSPOSyntexConsumingApplications';
        const body: { owningApplicationId: string, applicationId?: string } = {
            owningApplicationId: owningAppId
        };
        if (appId) {
            body.applicationId = appId;
        }
        const response = await this._sendPostRequest(method, body);
        return response.data as ISpConsumingApplicationProperties;
    }

    public async createContainerType(properties: ISpContainerTypeCreationProperties): Promise<ISpContainerTypeProperties> {
        const method = 'NewSPOContainerType';
        const body = {
            containerTypeProperties: properties
        };
        const response = await this._sendPostRequest(method, body);
        return response.data as ISpContainerTypeProperties;
    
    }

}


export interface ISpContainerTypeProperties {
    ApplicationRedirectUrl: string | null;
    AzureSubscriptionId: string | null;
    ContainerTypeId: string;
    CreationDate: string | null;
    DisplayName: string;
    ExpiryDate: string | null;
    IsBillingProfileRequired: boolean;
    OwningAppId: string;
    OwningTenantId: string;
    Region: string | null;
    ResourceGroup: string | null;
    SPContainerTypeBillingClassification: BillingClassification;
}

export interface ISpContainerTypeCreationProperties {
    DisplayName: string;
    OwningAppId: string;
    SPContainerTypeBillingClassification: BillingClassification;
    AzureSubscriptionId?: string;
    Region?: string;
    ResourceGroup?: string;
}

export interface ISpConsumingApplicationProperties {
    // These properties are not coming from the API
    TenantId: string | null;
    ContainerTypeId: string | null;

    ApplicationId: string | null;
    ApplicationName: string | null;
    Applications: string[];
    AppOnlyPermissions: string[];
    DelegatedPermissions: string[];
    OwningApplicationId: string;
    OwningApplicationName: string | null;
}
