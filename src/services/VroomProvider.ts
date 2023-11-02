/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios from "axios";
import { ApplicationPermissions } from "../models/ApplicationPermissions";

export default class VroomProvider {
    static async registerContainerType(accessToken: string, clientId: string, rootSiteUrl: string, containerTypeId: string, appPermissions: ApplicationPermissions[]) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        };
    
        const applicationPermissionsData = {
            value: appPermissions
        };
    
        try {
            const response = await axios.put(
                `${rootSiteUrl}/_api/v2.1/storageContainerTypes/${containerTypeId}/applicationPermissions`,
                JSON.stringify(applicationPermissionsData),
                options
            );
    
            console.log('ContainerType Registration successful:', response.data);
            return response.data.value;
        } catch (error: any) {
            console.error('Error registrating ContainerType: ', error.response);
            throw error;
        }
    }
    
} 

