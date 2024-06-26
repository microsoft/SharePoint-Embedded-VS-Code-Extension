/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { GraphProvider } from "../services/GraphProvider";
import { ISpConsumingApplicationProperties } from "../services/SpAdminProvider";
import { Account } from "./Account";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { Container } from "./Container";
import { ContainerType } from "./ContainerType";
import { CreateSecret } from "../commands/App/Credentials/CreateSecret";
import { checkJwtForAppOnlyRole, decodeJwt } from "../utils/token";
import { GetLocalAdminConsent } from "../commands/App/GetLocalAdminConsent";
import { CreateAppCert } from "../commands/App/Credentials/CreateAppCert";
import AppProvider from "../services/AppProvider";
import AppOnly3PAuthProvider from "../services/AppOnly3PAuthProvider";


// Class that represents a Container Type Registration object
export class ContainerTypeRegistration {
    // instance properties
    public get containerTypeId(): string {
        return this.containerType.containerTypeId;
    }
    public readonly tenantId: string;
    public readonly owningAppId: string;
    public applications: string[];

    public constructor(public readonly containerType: ContainerType, properties: ISpConsumingApplicationProperties) {
        this.tenantId = properties.TenantId!;
        this.owningAppId = properties.OwningApplicationId!;
        this.applications = properties.Applications;
    }

    private _applicationPermissions?: ApplicationPermissions[];
    public get applicationPermissions(): ApplicationPermissions[] | undefined {
        return this._applicationPermissions;
    }
    public async loadApplicationPermissions(): Promise<ApplicationPermissions[] | undefined> {
        if (Account.get() && Account.get()!.containerTypeProvider) {
            const provider = Account.get()!.containerTypeProvider;
            this.applications = (await provider.getAppPermissions(this)).apps;
            const appPerms = this.applications.map(async (appId: string) => {
                return await provider.getAppPermissions(this, appId);
            });
            this._applicationPermissions = await Promise.all(appPerms);
        }
        return this._applicationPermissions;
    }

    private _containers?: Container[];
    public get containers(): Container[] | undefined {
        return this._containers;
    }
    public async loadContainers(): Promise<Container[] | undefined> {
        await this.containerType.loadOwningApp();
        if (this.containerType.owningApp) {
            const hasCreds = await this._checkOrCreateCredentials();
            if (!hasCreds) {
                return;
            }

            const authProvider = await this.containerType.owningApp.getAppOnlyAuthProvider(this.tenantId);
            const appProvider = Account.get()!.appProvider;
            const appOnlyGraphProvider = new GraphProvider(authProvider);

            const hasRole = await this._checkOrConsentFileStorageContainerRole(appProvider, authProvider);
            if (!hasRole) {
                return;
            }

            this._containers = await appOnlyGraphProvider.listContainers(this);
        }
        return this._containers;
    }

    private _recycledContainers?: Container[];
    public get recycledContainers(): Container[] | undefined {
        return this._recycledContainers;
    }
    public async loadRecycledContainers(): Promise<Container[] | undefined> {
        if (!this.containerType.owningApp) {
            await this.containerType.loadOwningApp();
        }
        if (this.containerType.owningApp) {
            const hasCreds = await this._checkOrCreateCredentials();
            if (!hasCreds) {
                return;
            }
            const authProvider = await this.containerType.owningApp.getAppOnlyAuthProvider(this.tenantId);
            const appProvider = Account.get()!.appProvider;
            const appOnlyGraphProvider = new GraphProvider(authProvider);

            const hasRole = await this._checkOrConsentFileStorageContainerRole(appProvider, authProvider);
            if (!hasRole) {
                return;
            }
            this._recycledContainers = await appOnlyGraphProvider.listRecycledContainers(this);
        }
        return this._recycledContainers;
    }

    private async _checkOrCreateCredentials(): Promise<boolean> {
        const secretPrompt = 'Create secret';
        const certificatePrompt = 'Create certificate';
        const hasCreds = await this.containerType.owningApp!.hasCert() || await this.containerType.owningApp!.hasSecret();
        if (!hasCreds) {
            const userChoice = await vscode.window.showInformationMessage(
                "No credentials were found on this app. Would you like to create one?",
                secretPrompt, certificatePrompt, 'Cancel'
            );
            if (userChoice === secretPrompt) {
                await CreateSecret.run(this.containerType.owningApp);
                return true;
            } else if (userChoice === certificatePrompt) {
                await CreateAppCert.run(this.containerType.owningApp);
                return true;
            } else {
                return false;
            }
        }
        return true;
    }

    private async _checkOrConsentFileStorageContainerRole(appProvider: AppProvider, authProvider: AppOnly3PAuthProvider): Promise<boolean> {
        // Check if app has been configured with correct role, if not, update it
        const hasFileStorageContainerGraphRole = this.containerType.owningApp!.checkRequiredResourceAccess(appProvider.GraphResourceAppId, appProvider.FileStorageContainerRole.id);
        if (!hasFileStorageContainerGraphRole) {
            await appProvider.addResourceAccess(this.containerType.owningApp!, {
                resourceAppId: appProvider.GraphResourceAppId,
                resourceAccess: [
                    appProvider.FileStorageContainerRole
                ]
            });
        }

        // Check if the appOnlyToken has the correct role, if not, consent to the FileStorageContainer.Selected role
        const token = await authProvider.getToken(['https://graph.microsoft.com/.default']);
        const decodedToken = decodeJwt(token);
        const hasRole = checkJwtForAppOnlyRole(decodedToken, 'FileStorageContainer.Selected');

        if (!hasRole) {
            const grantConsent = `Grant consent`;
            const buttons = [grantConsent];
            const choice = await vscode.window.showInformationMessage(
                `The owning app '${this.containerType.owningApp?.displayName}' does not have the necessary consent to perform this action. You need to grant consent to the app before perform container operations. Do you want to grant consent now?`,
                ...buttons
            );
            if (choice !== grantConsent) {
                return false;
            }
            const consented = await GetLocalAdminConsent.run(this.containerType.owningApp);
            if (!consented) {
                return false;
            }
        }
        return true;
    }
}