/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import axios, { AxiosResponse } from 'axios';
import { BillingClassification } from '../models/ContainerType';

export default class SPAdminProvider {
    static async createNewContainerType(accessToken: any, tenantName: any, owningAppId: string, displayName: string, billingClassification: BillingClassification) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const containerTypeData = {
            containerTypeProperties: {
                DisplayName: displayName,
                OwningAppId: owningAppId,
                SPContainerTypeBillingClassification: billingClassification
            }
        }

        try {
            const response: AxiosResponse = await axios.post(`https://${tenantName}-admin.sharepoint.com/_api/SPO.Tenant/NewSPOContainerType`,
                JSON.stringify(containerTypeData),
                options
            );
            console.log('Success creating container type', response.data);
            return response.data;
        } catch (error: any) {
            if (error.response && error.response.status === 500) {
                const errorMessage = error.message;
                if (errorMessage.includes("Maximum number of allowed Trial Container Types has been exceeded.")) {
                    throw new Error("Maximum number of allowed Trial Container Types has been exceeded.")
                } else if (errorMessage.inclues("")) {
                    throw new Error("Maximum number of allowed Trial Container Types has been exceeded.")
                }
            }
            else if (error.response && error.response.status === 400) {
                const errorMessage = error.message;
                if (errorMessage.includes("Accept the terms of service in SharePoint admin center to continue")) {
                    throw new Error("SharePoint Embedded Terms of Service have not been accepted. Visit https://aka.ms/enable-spe")
                }
            } else {
                throw new Error(error.message);
            }
        }
    }

    static async getContainerTypes(accessToken: any, tenantName: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const containerTypeData = {
            containerTenantType: 1
        }

        try {
            const response: AxiosResponse = await axios.post(`https://${tenantName}-admin.sharepoint.com/_api/SPO.Tenant/GetSPOContainerTypes`,
                JSON.stringify(containerTypeData),
                options
            );
            console.log('Success getting container type', response.data.value);
            return response.data.value;
        } catch (error) {
            console.error('Error getting container type', error);
            throw error;
        }
    }

    static async getContainerTypeById(accessToken: any, tenantName: string, containerTypeId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const containerTypeData = {
            containerTypeId: containerTypeId,
            containerTenantType: 1
        }

        try {
            const response: AxiosResponse = await axios.post(`https://${tenantName}-admin.sharepoint.com/_api/SPO.Tenant/GetSPOContainerTypeById`,
                JSON.stringify(containerTypeData),
                options
            );
            console.log('Success getting container type', response.data.value);
            return response.data.value;
        } catch (error) {
            console.error('Error getting container type', error);
            throw error;
        }
    }

    static async deleteContainerTypeById(accessToken: any, tenantName: string, containerTypeId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const containerTypeData = {
            spDeletedContainerTypeProperties: {
                ContainerTypeId: containerTypeId
            }
        }

        // const containerTypeData = {
        //     containerTypeId: containerTypeId
        // }

        try {
            const response: AxiosResponse = await axios.post(`https://${tenantName}-admin.sharepoint.com/_api/SPO.Tenant/RemoveSPOContainerType`,
                JSON.stringify(containerTypeData),
                options
            );

            // const response: AxiosResponse = await axios.post(`https://${tenantName}-admin.sharepoint.com/_api/SPO.Tenant/DeleteSPOContainerTypeById`,
            //     JSON.stringify(containerTypeData),
            //     options
            // );
            console.log(`Success deleting Container Type ${containerTypeId}`, response.data);
            return response.data;
        } catch (error) {
            console.error(`Error deleting Container Type ${containerTypeId}`, error);
            throw error;
        }
    }
}

