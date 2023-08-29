import axios, { AxiosResponse } from "axios";

export default class GraphProvider {
    async getUserDrive(accessToken: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };

        try {
            const response = await axios.get("https://graph.microsoft.com/v1.0/me/drive", options);
            return response.data;
        } catch (error) {
            console.log(error)
            return error;
        }
    };

    async getOwningTenantName(accessToken: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };
        try {
            const response: AxiosResponse = await axios.get("https://graph.microsoft.com/v1.0/organization", options);
            const tenantName = response.data.value[0].displayName;
            return tenantName;
        } catch (error) {
            console.error("Error fetching tenant name:", error);
            throw error;
        }
    };

    async createAadApplication(accessToken: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const applicationData = {
            displayName: 'My New Application',
            publicClient: {
                redirectUris: [
                    'http://localhost:12345/redirect'
                ],
            }
        };
        try {
            const response: AxiosResponse = await axios.post("https://graph.microsoft.com/v1.0/applications",
                JSON.stringify(applicationData),
                options
            );
            console.log('Created application:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error creating application:', error);
            throw error;
        }
    }

    async uploadKeyCredentialToApplication(accessToken: string, clientId: string, keyCredential: any) {
        try {
            const response = await axios({
                method: 'patch',
                url: `https://graph.microsoft.com/v1.0/applications(appId='${clientId}')`,
                data: {
                    keyCredentials: [keyCredential]
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            console.log('Key credential updated successfully:', response.data);
        } catch (error: any) {
            console.error('Error updating key credential:', error.response.data);
        }
    }

    async getCertThumbprintFromApplication(accessToken: string, clientId: string) {
        const headers = {
            Authorization: `Bearer ${accessToken}`,
        };

        try {
            const response = await axios.get(`https://graph.microsoft.com/v1.0/applications?$filter=appId eq '${clientId}'`,
            { headers });

            if (response.data.value && response.data.value.length > 0) {
                const application = response.data.value[0];
                const keyCredentials = application.keyCredentials;

                if (keyCredentials && keyCredentials.length > 0) {
                    const thumbprint = keyCredentials[0].customKeyIdentifier;
                    console.log('Thumbprint:', thumbprint);
                    return thumbprint;
                } else {
                    console.log('No key credentials found for the application.');
                }
            } else {
                console.log('Application not found.');
            }
        } catch (error: any) {
            console.error('Error:', error.response?.data || error.message);
        }
    }
}