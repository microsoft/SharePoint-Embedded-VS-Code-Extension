/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios, { AxiosResponse } from 'axios';
import { BillingClassification, ContainerType } from '../models/ContainerType';
import { BaseAuthProvider } from './BaseAuthProvider';
import { ApplicationPermission } from '../models/ApplicationPermissions';
import { TelemetryProvider } from './TelemetryProvider';
import { CreateTrialContainerTypeApiFailure, CreateTrialContainerTypeApiSuccess, DeleteTrialContainerTypeApiFailure, DeleteTrialContainerTypeApiSuccess } from '../models/telemetry/telemetry';

export default class SpAdminProvider {
    private readonly _baseApiUrl;
    private readonly _scopes;

    public constructor(private _authProvider: BaseAuthProvider, private _spAdminUrl: string) {
        this._baseApiUrl = `${this._spAdminUrl}/_api/SPO.Tenant/`;
        this._scopes = [`${this._spAdminUrl}/AllSites.FullControl`];
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
        try {
            const response = await this._sendPostRequest(method, body);
            if (properties.SPContainerTypeBillingClassification === BillingClassification.FreeTrial) {
                TelemetryProvider.instance.send(new CreateTrialContainerTypeApiSuccess(response));
            }
            return response.data as ISpContainerTypeProperties;
        } catch (error: any) {
            if (properties.SPContainerTypeBillingClassification === BillingClassification.FreeTrial) {
                TelemetryProvider.instance.send(new CreateTrialContainerTypeApiFailure(error.message, error.response));
            }
            throw error;
        }
    }

    public async deleteContainerType(containerTypeId: string): Promise<void> {
        const method = 'RemoveSPOContainerType';
        const body = {
            spDeletedContainerTypeProperties: {
                ContainerTypeId: containerTypeId
            }
        };
        try {
            const response = await this._sendPostRequest(method, body);
            TelemetryProvider.instance.send(new DeleteTrialContainerTypeApiSuccess(response));
        } catch (error: any) {
            TelemetryProvider.instance.send(new DeleteTrialContainerTypeApiFailure(error.message, error.response));
            throw error;
        }
    }

    public async setContainerTypeProperties(containerTypeId: string, owningAppId?: string, displayName?: string, applicationRedirectUrl?: string): Promise<void> {
        const method = 'SetSPOContainerType';
        const containerTypeProperties = {
            ContainerTypeId: containerTypeId,
            ...(owningAppId && { OwningAppId: owningAppId }),
            ...(displayName && { DisplayName: displayName }),
            ...(applicationRedirectUrl && { ApplicationRedirectUrl: applicationRedirectUrl })
        };
        const body = {
            containerTypeProperties: containerTypeProperties
        };
        const response = await this._sendPostRequest(method, body);
    }

}

export interface ISpApplicationPermissions {
    appId: string;
    delegated: ApplicationPermission[];
    appOnly: ApplicationPermission[];
}


export interface ISpContainerTypeProperties {
    ApplicationRedirectUrl: string | null | undefined;
    AzureSubscriptionId: string | null;
    ContainerTypeId: string;
    CreationDate: string | null;
    DisplayName: string;
    ExpiryDate: string | null;
    IsBillingProfileRequired: boolean;
    OwningAppId: string;
    OwningTenantId: string;
    Region: string | null | undefined;
    ResourceGroup: string | null | undefined;
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
