/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { Application, KeyCredential, RequiredResourceAccess } from "@microsoft/microsoft-graph-types";
import { v4 as uuidv4 } from 'uuid';
import { GraphProvider } from "./GraphProvider";
import { App } from "../models/App";
import { createCertKeyCredential, generateCertificateAndPrivateKey } from "../cert";
import { forEach } from "lodash";
import { GetLocalAdminConsent } from "../commands/App/GetLocalAdminConsent";
import { decodeJwt, checkJwtForAppOnlyRole } from "../utils/token";
import AppOnly3PAuthProvider from "./AppOnly3PAuthProvider";
import { ProgressWaitNotification, Timer } from '../views/notifications/ProgressWaitNotification';

export default class AppProvider {
    public constructor(private _graph: GraphProvider) { }

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

    public async checkApiScope(app: App) {
        const existing: Application | undefined = await this._graph.getApp(app.clientId);
        if (existing === undefined) {
            return;
        }
        return existing.api && existing.api.oauth2PermissionScopes && existing.api.oauth2PermissionScopes.find((scope: any) => scope.value === "Container.Manage") !== undefined;
    }

    public async addApiScope(app: App) {
        const existing: Application | undefined = await this._graph.getApp(app.clientId);
        if (existing === undefined) {
            return;
        }
        const merged = {
            ...existing
        } as any;
        if (existing.api && existing.api.oauth2PermissionScopes && existing.api.oauth2PermissionScopes.find((scope: any) => scope.value === "Container.Manage") === undefined) {
            merged.api.oauth2PermissionScopes = [...new Set([...existing.api.oauth2PermissionScopes, ...this.baseAppConfig.api!.oauth2PermissionScopes!])] ;
            const [containerManageApiScope] = merged.api.oauth2PermissionScopes.slice(-1);
            containerManageApiScope.id = uuidv4();
        }
        await this._graph.updateApp(existing.id!, merged);
    }

    public async checkWebRedirectUris(app: App, requiredUris: string[]) {
        const existingAppDefinition = await this._graph.getApp(app.clientId);
        if (!existingAppDefinition) {
            return;
        }
        return existingAppDefinition.web && existingAppDefinition.web.redirectUris && requiredUris.every(uri => existingAppDefinition.web!.redirectUris!.includes(uri));
    }

    public async addWebRedirectUris(app: App, redirectUris: string[]) {
        const existing: Application | undefined = await this._graph.getApp(app.clientId);
        if (existing === undefined) {
            return;
        }
        const merged = {
            ...existing,
        } as any;
        merged.web.redirectUris = [...new Set([...(existing.web?.redirectUris || []), ...redirectUris])];
        await this._graph.updateApp(existing.id!, merged);
    }

    public async checkSpaRedirectUris(app: App, requiredUris: string[]) {
        const existingAppDefinition = await this._graph.getApp(app.clientId);
        if (!existingAppDefinition) {
            return;
        }
        return existingAppDefinition.spa && existingAppDefinition.spa.redirectUris && requiredUris.every(uri => existingAppDefinition.spa!.redirectUris!.includes(uri));
    }

    public async addSpaRedirectUris(app: App, redirectUris: string[]) {
        const existing: Application | undefined = await this._graph.getApp(app.clientId);
        if (existing === undefined) {
            return;
        }
        const merged = {
            ...existing,
        } as any;
        merged.spa.redirectUris = [...new Set([...(existing.spa?.redirectUris || []), ...redirectUris])];
        await this._graph.updateApp(existing.id!, merged);
    }

    public async checkIdentiferUri(app: App) {
        const existing: Application | undefined = await this._graph.getApp(app.clientId);
        if (existing === undefined) {
            return;
        }
        return existing.identifierUris && existing.identifierUris.includes(`api://${app.clientId}`);
    }

    public async addIdentifierUri(app: App) {
        const existing: Application | undefined = await this._graph.getApp(app.clientId);
        if (existing === undefined) {
            return;
        }
        const merged = {
            ...existing,
            identifierUris: [...new Set([...existing.identifierUris!, `api://${app.clientId}`])]
        };
        await this._graph.updateApp(existing.id!, merged);
    }

    public async addResourceAccess(app: App, newResource: RequiredResourceAccess) {
        if (newResource === undefined) {
            return;
        }
        const existing = app.requiredResourceAccess;
        const merged: RequiredResourceAccess[] = existing;
        const existingResourceIndex = merged.findIndex((resourceAccess: any) => resourceAccess.resourceAppId === newResource.resourceAppId);
        if (existingResourceIndex === -1) {
            merged.push(newResource);
        } else {
            // add the newResource to merged, but remove any duplicates
            forEach(merged, (resourceAccess: RequiredResourceAccess) => {
                if (resourceAccess.resourceAppId === newResource.resourceAppId) {
                    const uniqueItems: { [key: string]: any } = {};
                    const mergedItems = [...resourceAccess.resourceAccess!, ...newResource.resourceAccess!];
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
                    merged[existingResourceIndex] = mergedResourceAccess;
                }
            });
        }
        await this._graph.addRequiredResourceAccess(app.objectId, merged);
    }

    public async checkOrConsentFileStorageContainerRole(app: App, authProvider: AppOnly3PAuthProvider, optionalUserMessage?: string): Promise<boolean> {
        // Check if app has been configured with correct role, if not, update it
        const appConfigurationProgress = new ProgressWaitNotification(vscode.l10n.t('Configuring your app...'));
        const roleAddition = await this._ensureFileStorageContainerGraphRole(app, appConfigurationProgress, optionalUserMessage);
        if (!roleAddition) {
            appConfigurationProgress.hide();
            return false;
        }

        // Check if the appOnlyToken has the correct role, if not, consent to the FileStorageContainer.Selected role
        let token = await authProvider.getToken(['https://graph.microsoft.com/.default']);
        let decodedToken = decodeJwt(token);
        let hasRole = checkJwtForAppOnlyRole(decodedToken, 'FileStorageContainer.Selected');

        if (!hasRole) {
            // Check if consent URI has been added to app, if not, add it
            const requiredUris = [
                this.WebRedirectUris.consentRedirectUri
            ];

            const consentUriAdded = await this.ensureConsentRedirectUri(app, requiredUris);
            if (!consentUriAdded) {
                appConfigurationProgress.hide();
                return false;
            }

            appConfigurationProgress.hide();

            const consentGranted = await this._ensureGraphConsent(app, authProvider);
            if (!consentGranted) {
                return false;
            }

        }
        appConfigurationProgress.hide();
        return true;
    }

    private async _ensureFileStorageContainerGraphRole(app: App, appConfigurationProgress: ProgressWaitNotification, optionalUserMessage?: string): Promise<boolean> {
        let hasFileStorageContainerGraphRole = await app.checkRequiredResourceAccess(this.GraphResourceAppId, this.FileStorageContainerRole.id, false);
        if (!hasFileStorageContainerGraphRole) {
            const addRequiredRole = vscode.l10n.t(`Add FileStorageContainer.Selected role`);
            const buttons = [addRequiredRole, vscode.l10n.t('Skip')];
            const message = vscode.l10n.t('Your app {0} requires Graph FileStorageContainer.Selected API permission role to perform this action. {1} Add it now?', app.displayName, optionalUserMessage ? optionalUserMessage : '');
            const choice = await vscode.window.showInformationMessage(
                message,
                ...buttons
            );
            if (choice !== addRequiredRole) {
                return false;
            }

            appConfigurationProgress.show();
            await this.addResourceAccess(app, {
                resourceAppId: this.GraphResourceAppId,
                resourceAccess: [this.FileStorageContainerRole]
            });

            // Check if role has propagated to Entra app definition
            const rolePropagateTimer = new Timer(60 * 1000);
            hasFileStorageContainerGraphRole = await app.checkRequiredResourceAccess(this.GraphResourceAppId, this.FileStorageContainerRole.id, false);
            while (!hasFileStorageContainerGraphRole && !rolePropagateTimer.finished) {
                await new Promise(r => setTimeout(r, 2000));
                hasFileStorageContainerGraphRole = await app.checkRequiredResourceAccess(this.GraphResourceAppId, this.FileStorageContainerRole.id, false);
            }
            if (!hasFileStorageContainerGraphRole) {
                return false;
            }
        }
        return true; // Return true if the role is successfully added or already exists
    }

    private async _ensureGraphConsent(app: App, authProvider: AppOnly3PAuthProvider): Promise<boolean> {
        const grantConsent = vscode.l10n.t(`Grant consent`);
        const buttons = [grantConsent];
        const message = vscode.l10n.t(`The owning app '{0}' does not have the necessary consent to perform this action. Do you want to grant consent now?`, app.displayName);
        const choice = await vscode.window.showInformationMessage(
            message,
            ...buttons
        );
        if (choice !== grantConsent) {
            return false;
        }
        const consented = await GetLocalAdminConsent.run(app);
        if (!consented) {
            return false;
        }

        const consentPropagationProgress = new ProgressWaitNotification(vscode.l10n.t('Waiting for consent to propagate in Azure (may take a minute)...'));
        consentPropagationProgress.show();
        const consentPropagationTimer = new Timer(60 * 1000);
        let graphConsent = await authProvider.hasConsent('https://graph.microsoft.com/.default', ['FileStorageContainer.Selected']);
        while (!graphConsent && !consentPropagationTimer.finished) {
            await new Promise(r => setTimeout(r, 3000));
            graphConsent = await authProvider.hasConsent('https://graph.microsoft.com/.default', ['FileStorageContainer.Selected']);
        }
        consentPropagationProgress.hide();
        return graphConsent;
    }

    public async ensureConsentRedirectUri(app: App, requiredUris: string[]): Promise<boolean> {
        if (await this.checkWebRedirectUris(app, requiredUris)) {
            return true;
        }
        const message = vscode.l10n.t('Your owning app {0} is missing the required consent redirect URI. Would you like to add it now?', app.displayName);
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );
        if (userChoice !== vscode.l10n.t('OK')) {
            return false;
        }

        const appConfigurationTimer = new Timer(60 * 1000);

        while (!await this.checkWebRedirectUris(app, requiredUris) && !appConfigurationTimer.finished) {
            await this.addWebRedirectUris(app, requiredUris);
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!await this.checkWebRedirectUris(app, requiredUris)) {
            const message = vscode.l10n.t('Failed to add consent redirect URI to {0}', app.displayName);
            vscode.window.showErrorMessage(message);
            return false;
        }

        return true;
    }

    public get baseAppConfig(): Application {
        return {
            web: {
                redirectUris: [
                    this.WebRedirectUris.consentRedirectUri,
                    this.WebRedirectUris.postmanBrowserCallbackUri,
                    this.WebRedirectUris.postmanVscodeCallbackUri,
                    this.WebRedirectUris.postmanCallbackUri,
                    this.WebRedirectUris.serverAppSignInUri,
                    this.WebRedirectUris.serverAppSignOnboardingProcessCodeUri,
                    this.WebRedirectUris.serverAppSignOutUri
                ],
            },
            spa: {
                redirectUris: [
                    this.SpaRedirectUris.reactAppRedirectUri
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

    public get WebRedirectUris() {
        return {
            consentRedirectUri: 'http://localhost/redirect',
            postmanBrowserCallbackUri: 'https://oauth.pstmn.io/v1/browser-callback',
            postmanVscodeCallbackUri: 'https://oauth.pstmn.io/v1/vscode-callback',
            postmanCallbackUri: 'https://oauth.pstmn.io/v1/callback',
            serverAppSignInUri: 'https://localhost/signin-oidc',
            serverAppSignOnboardingProcessCodeUri: 'https://localhost/Onboarding/ProcessCode',
            serverAppSignOutUri: 'https://localhost/signout-oidc',
        };
    };

    public get SpaRedirectUris() {
        return {
            reactAppRedirectUri: 'http://localhost/'
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
