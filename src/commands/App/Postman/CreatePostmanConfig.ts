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
                "No client secret was found. Would you like to create one for this app?",
                'OK', 'Skip'
            );
            if (userChoice === 'OK') {
                await CreateSecret.run(applicationTreeItem);
                appSecrets = await app.getSecrets();
            }
        }

        if (!appSecrets.privateKey || !appSecrets.thumbprint) {
            const userChoice = await vscode.window.showInformationMessage(
                "No certificate was found. Would you like to create one for this app?",
                'OK', 'Skip'
            );
            if (userChoice === 'OK') {
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
        const tid = account.tenantId;

        const values: any[] = [];
        values.push(
            {
                key: "ContainerTypeId",
                value: containerType!.containerTypeId,
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

        const envName = `${containerType!.displayName} (appId: ${app!.clientId})`;
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

