/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { App } from "../../../models/App";
import { ContainerType } from "../../../models/ContainerType";
import { AppTreeItem } from "../../../views/treeview/development/AppTreeItem";
import { Command } from "../../Command";
import { v4 as uuidv4 } from 'uuid';
import { Account } from '../../../models/Account';
import { CreateAppCert } from '../Credentials/CreateAppCert';
import { CreateSecret } from '../Credentials/CreateSecret';

// Static class that handles the Postman config creation command
export class CreatePostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.createConfigFile';
    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem, app?: App, containerType?: ContainerType): Promise<PostmanEnvironmentConfig | undefined> {
        if (!applicationTreeItem || !app || !containerType) {
            return;
        }

        let appSecrets = await app.getSecrets();

        if (!appSecrets.clientSecret) {
            const userChoice = await vscode.window.showInformationMessage(
                vscode.l10n.t("No client secret was found. Would you like to create one for this app?"),
                vscode.l10n.t('OK'), vscode.l10n.t('Skip')
            );
            if (userChoice === vscode.l10n.t('OK')) {
                await CreateSecret.run(applicationTreeItem);
                appSecrets = await app.getSecrets();
            }
        }

        if (!appSecrets.privateKey || !appSecrets.thumbprint) {
            const userChoice = await vscode.window.showInformationMessage(
                vscode.l10n.t('No certificate was found. Would you like to create one for this app?'),
                vscode.l10n.t('OK'), vscode.l10n.t('Skip')
            );
            if (userChoice === vscode.l10n.t('OK')) {
                await CreateAppCert.run(applicationTreeItem);
                appSecrets = await app.getSecrets();

                let retries = 3;
                while ((!appSecrets.privateKey || !appSecrets.thumbprint) && retries > 0) {
                    retries--;
                    appSecrets = await app.getSecrets();
                }
            }
        }

        const account = Account.get()!;
        const authProvider = await app.getAppOnlyAuthProvider(account.tenantId);
        const requiredUris = [
            account.appProvider.WebRedirectUris.postmanBrowserCallbackUri,
            account.appProvider.WebRedirectUris.postmanCallbackUri
        ];

        // Check Postman redirect URIs
        try {
            if (!await account.appProvider.checkWebRedirectUris(app, requiredUris)) {
                const message = vscode.l10n.t('This app registration is missing the required Postman redirect URIs: {0}. Would you like to add them to the "Web" redirect URIs of your app configuration?', requiredUris.join('\n'));
                const userChoice = await vscode.window.showInformationMessage(
                    message,
                    vscode.l10n.t('OK'), vscode.l10n.t('Skip')
                );
                if (userChoice === vscode.l10n.t('OK')) {
                    await account.appProvider.addWebRedirectUris(app, requiredUris);
                }
            }
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to add redirect URIs: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }

        // Check for or enable App-Only auth
        try {
            await account.appProvider.checkOrConsentFileStorageContainerRole(app, authProvider, vscode.l10n.t("This enables the 'Application-only' requests in the Postman collection. "));
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to add and consent the FileStorageContainer.Selected required role: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }

        const tid = account.tenantId;
        const values: any[] = [];
        values.push(
            {
                key: "ContainerTypeId",
                value: containerType!.id,
                type: "default",
                enabled: true
            },
            {
                key: "ClientID",
                value: app!.clientId,
                type: "default",
                enabled: true
            },
            {
                key: "ConsumingTenantId",
                value: tid,
                type: "default",
                enabled: true
            },
            {
                key: "TenantName",
                value: account.domain,
                type: "default",
                enabled: true
            },
            {
                key: "RootSiteUrl",
                value: `${account.spRootSiteUrl}/`,
                type: "default",
                enabled: true
            },
            {
                key: "ClientSecret",
                value: appSecrets.clientSecret,
                type: "secret",
                enabled: true
            },
            {
                key: "CertThumbprint",
                value: appSecrets.thumbprint,
                type: "default",
                enabled: true
            },
            {
                key: "CertPrivateKey",
                value: appSecrets.privateKey,
                type: "secret",
                enabled: true
            }
        );

        const envName = `${containerType!.name} (appId ${app!.clientId})`;
        const pmEnv: PostmanEnvironmentConfig = {
            id: uuidv4(),
            name: envName,
            values: values,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _postman_variable_scope: "environment",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _postman_exported_at: (new Date()).toISOString(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _postman_exported_using: "Postman/10.13.5"
        };

        return pmEnv;
    }
}

export type PostmanEnvironmentConfig = {
    id: string;
    name: string;
    values: {
        key: string;
        value: string;
        type: string;
        enabled?: boolean;
    }[];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _postman_variable_scope: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _postman_exported_at: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _postman_exported_using: string;
};

