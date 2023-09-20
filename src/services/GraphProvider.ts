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

    async getOwningTenantDomain(accessToken: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };
        try {
            const response: AxiosResponse = await axios.get("https://graph.microsoft.com/v1.0/organization", options);
            // @ts-ignore: Ignore the 'any' type error for primaryDomain
            const primaryDomain = response.data.value[0].verifiedDomains.filter(domain => domain.isDefault)[0].name;
            return primaryDomain;
        } catch (error) {
            console.error("Error fetching tenant name:", error);
            throw error;
        }
    };

    async createAadApplication(accessToken: string, keyCredential: any) {
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
            },
            keyCredentials: [keyCredential],
            requiredResourceAccess: [
                {
                    "resourceAppId": "00000003-0000-0ff1-ce00-000000000000",
                    "resourceAccess": [
                        {
                            "id": "19766c1b-905b-43af-8756-06526ab42875",
                            "type": "Role"
                        },
                        {
                            "id": "4d114b1a-3649-4764-9dfb-be1e236ff371",
                            "type": "Scope"
                        },
                        {
                            "id": "640ddd16-e5b7-4d71-9690-3f4022699ee7",
                            "type": "Scope"
                        }
                    ]
                },
                {
                    "resourceAppId": "00000003-0000-0000-c000-000000000000",
                    "resourceAccess": [
                        {
                            "id": "37f7f235-527c-4136-accd-4a02d197296e",
                            "type": "Scope"
                        },
                        {
                            "id": "14dad69e-099b-42c9-810b-d002981feec1",
                            "type": "Scope"
                        },
                        {
                            "id": "7427e0e9-2fba-42fe-b0c0-848c9e6a8182",
                            "type": "Scope"
                        },
                        {
                            "id": "4908d5b9-3fb2-4b1e-9336-1888b7937185",
                            "type": "Scope"
                        },
                        {
                            "id": "bdfbf15f-ee85-4955-8675-146e8e5296b5",
                            "type": "Scope"
                        },
                        {
                            "id": "085ca537-6565-41c2-aca7-db852babc212",
                            "type": "Scope"
                        },
                        {
                            "id": "10465720-29dd-4523-a11a-6a75c743c9d9",
                            "type": "Scope"
                        },
                        {
                            "id": "40dc41bc-0f7e-42ff-89bd-d9516947e474",
                            "type": "Role"
                        }
                    ]
                }
            ],

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

    async addSPScopes(accessToken: string, clientId: string) {
        try {
            const response = await axios({
                method: 'patch',
                url: `https://graph.microsoft.com/v1.0/applications(appId='${clientId}')`,
                data: {
                    requiredResourceAccess: [
                        {
                            "resourceAppId": "00000003-0000-0ff1-ce00-000000000000",
                            "resourceAccess": [
                                {
                                    "id": "19766c1b-905b-43af-8756-06526ab42875",
                                    "type": "Role"
                                },
                                {
                                    "id": "4d114b1a-3649-4764-9dfb-be1e236ff371",
                                    "type": "Scope"
                                },
                                {
                                    "id": "640ddd16-e5b7-4d71-9690-3f4022699ee7",
                                    "type": "Scope"
                                }
                            ]
                        },
                        // {
                        //     "resourceAppId": "00000003-0000-0000-c000-000000000000",
                        //     "resourceAccess": [
                        //         {
                        //             "id": "37f7f235-527c-4136-accd-4a02d197296e",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "14dad69e-099b-42c9-810b-d002981feec1",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "7427e0e9-2fba-42fe-b0c0-848c9e6a8182",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "4908d5b9-3fb2-4b1e-9336-1888b7937185",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "bdfbf15f-ee85-4955-8675-146e8e5296b5",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "085ca537-6565-41c2-aca7-db852babc212",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "10465720-29dd-4523-a11a-6a75c743c9d9",
                        //             "type": "Scope"
                        //         },
                        //         {
                        //             "id": "40dc41bc-0f7e-42ff-89bd-d9516947e474",
                        //             "type": "Role"
                        //         }
                        //     ]
                        // }
                    ],
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            console.log('Key credential updated successfully:', response.data);
        }
        catch (error) {
            console.error('Error adding permissions application:', error);
            throw error;
        }
    }


    async listApplications(accessToken: string): Promise<any> {
        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            };

            const response = await axios.get("https://graph.microsoft.com/v1.0/applications", config);
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