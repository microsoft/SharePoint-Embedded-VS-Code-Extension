/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, KeyCredential, RequiredResourceAccess} from "@microsoft/microsoft-graph-types";
import { v4 as uuidv4 } from 'uuid';
import { GraphProvider } from "./GraphProvider";
import { App } from "../models/App";
import { createCertKeyCredential, generateCertificateAndPrivateKey } from "../cert";
import { forEach } from "lodash";

export default class AppProvider {
    
    public constructor(private _graph: GraphProvider) {}

    private _generateCertCredential(): CertCredential {
        const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
        return {
            keyCredential: createCertKeyCredential(certificatePEM),
            thumbprint: thumbprint,
            privateKey: privateKey
        } as CertCredential;
    }

    public async search(query: string = ''): Promise<Application[]> {
        return this._graph.searchApps(query);
    }

    public async get(appId: string): Promise<App | undefined> {
        const application = await this._graph.getApp(appId);
        if (application) {
            return new App(application);
        }
    }

    public async addSecret(app: App) {
        const clientSecret = await this._graph.addAppSecret(app.objectId);
        await app.setSecrets({ clientSecret: clientSecret });
    }

    public async addCert(app: App) {
        const cert = this._generateCertCredential();
        await this._graph.addAppCert(app.objectId, cert.keyCredential);
        await app.setSecrets({ thumbprint: cert.thumbprint, privateKey: cert.privateKey });
    }

    public async create(displayName: string): Promise<App> {
        const cert = this._generateCertCredential();
        const config = {
            ...this.baseAppConfig,
            keyCredentials: [cert.keyCredential],
            displayName,
        } as Application;
        const application = await this._graph.createApp(config);
        const app = new App(application);
        await app.setSecrets({ thumbprint: cert.thumbprint, privateKey: cert.privateKey });
        return app;
    }

    public async addResourceAccess(app: App, config: RequiredResourceAccess[]) {
        if (config.length === 0) {
            return;
        }
        const merged: RequiredResourceAccess[] = [];
        const existing = app.requiredResourceAccess;
        forEach(existing, (resourceAccess: any) => {
            const existingResourceAccess = config.find((existingResourceAccess: any) => existingResourceAccess.resourceAppId === resourceAccess.resourceAppId);
            if (existingResourceAccess) {
                const uniqueItems: { [key: string]: any } = {};
                const mergedItems = [...resourceAccess.resourceAccess, ...existingResourceAccess.resourceAccess!];
                mergedItems.forEach((item: any) => {
                    const key = `${item.id}_${item.type}`;
                    if (!uniqueItems[key]) {
                        uniqueItems[key] = item;
                    }
                });
                const filteredItems = Object.values(uniqueItems);
                const mergedResourceAccess = {
                    resourceAppId: resourceAccess.resourceAppId,
                    resourceAccess: filteredItems
                };
                merged.push(mergedResourceAccess);
            } else {
                merged.push(resourceAccess);
            }
        });

        await this._graph.addRequiredResourceAccess(app.objectId, merged);
    }

    public get baseAppConfig(): Application {
        return {
            web: {
                redirectUris: [
                    'http://localhost/redirect',
                    'https://oauth.pstmn.io/v1/browser-callback',
                    'https://oauth.pstmn.io/v1/callback',
                    'https://localhost/signin-oidc',
                    'https://localhost/Onboarding/ProcessCode',
                    'https://localhost/signout-oidc'          
                ],
            },
            spa: {
                redirectUris: [
                    'http://localhost/'
                ]
            },
            api: {
                oauth2PermissionScopes: [
                    {
                        id: uuidv4(),
                        type: "User",
                        value: "Container.Manage",
                        userConsentDisplayName: "Create and manage storage containers",
                        userConsentDescription: "Create and manage storage containers",
                        adminConsentDisplayName: "Create and manage storage containers",
                        adminConsentDescription: "Create and manage storage containers"
                    }
                ],
                requestedAccessTokenVersion: 2
            },
            keyCredentials: [],
            requiredResourceAccess: [
                {
                    resourceAppId: this.SharePointResourceAppId,
                    resourceAccess: [
                        this.ContainerSelectedScope,
                        this.ContainerSelectedRole,
                    ]
                },
                {
                    resourceAppId: this.GraphResourceAppId,
                    resourceAccess: [
                        this.FileStorageContainerScope,
                        this.FileStorageContainerRole
                    ]
                }
            ],
        };
    }

    public get GraphResourceAppId() {
        return "00000003-0000-0000-c000-000000000000";
    }

    public get FileStorageContainerScope() {
        return {
            id: "085ca537-6565-41c2-aca7-db852babc212",
            type: "Scope"
        };
    }

    public get FileStorageContainerRole() {
        return {
            id: "40dc41bc-0f7e-42ff-89bd-d9516947e474",
            type: "Role"
        };
    }

    public get SharePointResourceAppId() {
        return "00000003-0000-0ff1-ce00-000000000000";
    }
    
    public get ContainerSelectedScope() {
        return {
            id: "4d114b1a-3649-4764-9dfb-be1e236ff371",
            type: "Scope"
        };
    }

    public get ContainerSelectedRole() {
        return {
            id: "19766c1b-905b-43af-8756-06526ab42875",
            type: "Role"
        };
    }

}

type CertCredential = {
    keyCredential: KeyCredential;
    thumbprint: string;
    privateKey: string;
};
