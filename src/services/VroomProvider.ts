import axios from "axios";

export default class VroomProvider {
    async registerContainerType(accessToken: string, clientId: string, rootSiteUrl: string, containerTypeId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        };
    
        const applicationPermissionsData = {
            value: [
                {
                    appId: clientId,
                    delegated: ['full'],
                    appOnly: ['full'],
                },
            ],
        };
    
        try {
            const response = await axios.put(
                `${rootSiteUrl}/_api/v2.1/storageContainerTypes/${containerTypeId}/applicationPermissions`,
                JSON.stringify(applicationPermissionsData),
                options
            );
    
            console.log('ContainerType Registration successful:', response.data);
            return response.data;
        } catch (error: any) {
            console.error('Error registrating ContainerType: ', error.response);
            throw error;
        }
    }
    
} 

