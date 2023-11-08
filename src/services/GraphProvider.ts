/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios, { AxiosResponse } from "axios";
import { v4 as uuidv4 } from 'uuid';

export default class GraphProvider {

    static async checkAdminMemberObjects(accessToken: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const applicationData = {
            "ids": [
                "62e90394-69f5-4237-9190-012177145e10",
                "f28a1f50-f6e7-4571-818b-6a12f2af6b6c"
            ]
        }

        try {
            const response: AxiosResponse = await axios.post(`https://graph.microsoft.com/v1.0/me/checkMemberObjects`,
                JSON.stringify(applicationData),
                options
            );
            console.log('Returning valid member objects: ', response.data);
            return response.data;
        } catch (error) {
            console.error('Error retreiving member objects:', error);
            throw error;
        }
    };

    static async getOwningTenantDomain(accessToken: string) {
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

    static async getApplicationById(accessToken: string, appId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };
        try {
            const response: AxiosResponse = await axios.get(`https://graph.microsoft.com/v1.0/applications(appId='${appId}')`, options);
            return response.data;
        } catch (error) {
            console.error(`Error fetching app ${appId}:`, error);
            throw error;
        }
    };

    static async createAadApplication(applicationName: string, accessToken: string, certKeyCredential: any) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const applicationData = {
            displayName: applicationName,
            // publicClient: {
            //     redirectUris: [
            //         'http://localhost/redirect'
            //     ],
            // },
            web: {
                redirectUris: [
                    'http://localhost/redirect',
                    'https://oauth.pstmn.io/v1/browser-callback',
                    'https://oauth.pstmn.io/v1/callback'
                ],
            },
            spa: {
                redirectUris: [
                    'https://localhost/signin-oidc',
                    'http://localhost/'
                ]
            },
            "api": {
                "oauth2PermissionScopes": [
                    {
                        "id": uuidv4(),
                        "type": "User",
                        "value": "Container.Manage",
                        "userConsentDisplayName": "Create and manage storage containers",
                        "userConsentDescription": "Create and manage storage containers",
                        "adminConsentDisplayName": "Create and manage storage containers",
                        "adminConsentDescription": "Create and manage storage containers"
                    }
                ],
                "requestedAccessTokenVersion": "2"
            },
            keyCredentials: [certKeyCredential],
            requiredResourceAccess: [
                {
                    // https://microsoft.sharepoint.com
                    "resourceAppId": "00000003-0000-0ff1-ce00-000000000000",
                    "resourceAccess": [
                        {
                            //AllSites.Write
                            "id": "640ddd16-e5b7-4d71-9690-3f4022699ee7",
                            "type": "Scope"
                        },
                        {
                            "id": "4d114b1a-3649-4764-9dfb-be1e236ff371",
                            "type": "Scope"
                        },
                        {
                            "id": "19766c1b-905b-43af-8756-06526ab42875",
                            "type": "Role"
                        },
                        // AllSites.Write - application
                        {
                            "id": "fbcd29d2-fcca-4405-aded-518d457caae4",
                            "type": "Role"
                        }
                    ]
                },
                {
                    "resourceAppId": "00000003-0000-0000-c000-000000000000",
                    "resourceAccess": [
                        // delegated - openid
                        {
                            "id": "37f7f235-527c-4136-accd-4a02d197296e",
                            "type": "Scope"
                        },
                        // delegated - profile
                        {
                            "id": "14dad69e-099b-42c9-810b-d002981feec1",
                            "type": "Scope"
                        },
                        // delegated - offline_access
                        {
                            "id": "7427e0e9-2fba-42fe-b0c0-848c9e6a8182",
                            "type": "Scope"
                        },
                        // delegated - Application.ReadWrite.All ** CHANGE TO Application.Read.All (c79f8feb-a9db-4090-85f9-90d820caa0eb) when 1P app available 
                        {
                            "id": "bdfbf15f-ee85-4955-8675-146e8e5296b5",
                            "type": "Scope"
                        },
                        // delegated - FileStorageContainer.Selected
                        {
                            "id": "085ca537-6565-41c2-aca7-db852babc212",
                            "type": "Scope"
                        },
                        // delegated - Files.Read
                        {
                            "id": "10465720-29dd-4523-a11a-6a75c743c9d9",
                            "type": "Scope"
                        },
                        // application - Organization.Read.All
                        {
                            "id": "498476ce-e0fe-48b0-b801-37ba7e2685c6",
                            "type": "Role"
                        },
                        // application - Sites.ReadWrite.All
                        {
                            "id": "9492366f-7969-46a4-8d15-ed1a20078fff",
                            "type": "Role"
                        },
                        // application - FileStorageContainer.Selected
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

    static async listApplications(accessToken: string): Promise<any> {
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

    static async deleteApplication(accessToken: string, applicationId: string) {
        const endpoint = `https://graph.microsoft.com/v1.0/applications/${applicationId}`;
      
        try {
          const response = await axios.delete(endpoint, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
      
          console.log(`Application with ID ${applicationId} deleted successfully.`);
        } catch (error: any) {
          console.error('Error deleting the application:', error.response.data);
          throw error;
        }
      };

    static async addIdentifierUri(accessToken: string, clientId: string) {
        try {
            const response = await axios({
                method: 'patch',
                url: `https://graph.microsoft.com/v1.0/applications(appId='${clientId}')`,
                data: {
                    "identifierUris": [
                        `api://${clientId}`
                    ]
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            console.log('Identifier URI added successfully:', response.data);
        } catch (error: any) {
            console.error('Error adding identifier URI:', error.response.data);
        }
    }

    static async addPasswordWithRetry(accessToken: string, clientId: string) {
        const maxRetries = 3;
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const response = await this.addPassword(accessToken, clientId);
                return response;
            } catch (error: any) {
                if (error.response && error.response.status === 404) {
                    console.log(`Received a 404 error. Retrying... (Retry ${retries + 1})`);
                    retries++;
                } else {
                    // Handle other errors here
                    console.error('Error uploading password credential:', error);
                    throw error;
                }
            }
        }

        // If maxRetries are exceeded, you can throw an error or return an appropriate result.
        console.error('Maximum number of retries reached.');
        throw new Error('Maximum number of retries reached.');
    }

    static async addPassword(accessToken: string, clientId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const currentDate = new Date();
        const newEndDateTime = new Date(currentDate);
        newEndDateTime.setFullYear(currentDate.getFullYear() + 1); // Add 1 year
        newEndDateTime.setHours(currentDate.getHours() - 1);      // Subtract 1 hour

        const applicationData = {
            "passwordCredential": {
                displayName: 'VS Code Extension Secret',
                // startDateTime: currentDate, 
                // endDateTime: newEndDateTime
            }
        }

        try {
            const response: AxiosResponse = await axios.post(`https://graph.microsoft.com/v1.0/applications(appId='${clientId}')/addPassword`,
                JSON.stringify(applicationData),
                options
            );
            console.log('Password credential uploaded successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error uploaded password credential:', error);
            throw error;
        }
    }

    static async getCertThumbprintFromApplication(accessToken: string, clientId: string) {
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


    // Container Management APIs


    static async listStorageContainers(accessToken: string, containerTypeId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };
        try {
            const response: AxiosResponse = await axios.get(`https://graph.microsoft.com/beta/storage/fileStorage/containers?$filter=containerTypeId eq ${containerTypeId}`, options);
            return response.data.value;
        } catch (error) {
            console.error(`Error fetching containers`, error);
            throw error;
        }
    };

    static async createStorageContainer(accessToken: string, containerTypeId: string, displayName: string, description: string) {
        const containerData = {
            "displayName": displayName,
            "description": description,
            "containerTypeId": containerTypeId
        }
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        try {
            const response: AxiosResponse = await axios.post(`https://graph.microsoft.com/beta/storage/fileStorage/containers`,
            JSON.stringify(containerData),
            options);
            return response.data;
        } catch (error) {
            console.error(`Error creating container: ${displayName} on Container Type ${containerTypeId}`, error);
            throw error;
        }
    };

    static async getStorageContainer(accessToken: string, containerId: string) {
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        try {
            const response: AxiosResponse = await axios.get(`https://graph.microsoft.com/beta/storage/fileStorage/containers/${containerId}`, options);
            return response.data;
        } catch (error) {
            console.error(`Error fetching container ${containerId}`, error);
            throw error;
        }
    };
}