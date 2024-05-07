/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Command } from '../../Command';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';
import { Account } from '../../../models/Account';
import { App } from '../../../models/App';
import { ContainerType } from '../../../models/ContainerType';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { CreateSecret } from '../CreateSecret';
import * as fs from 'fs';
import * as path from 'path';

// Static class that handles the Postman copy command
export class ExportPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.exportEnvironmentFile';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        if (!applicationTreeItem) {
            return;
        }

        let app: App | undefined;
        let containerType: ContainerType | undefined;
        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            app = applicationTreeItem.appPerms.app;
            containerType = applicationTreeItem.appPerms.containerTypeRegistration.containerType;
        }
        if (applicationTreeItem instanceof OwningAppTreeItem) {
            app = applicationTreeItem.containerType.owningApp!;
            containerType = applicationTreeItem.containerType;
        }
        if (!app || !containerType) {
            vscode.window.showErrorMessage('Could not find app or container type');
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

                let retries = 3;
                while (!appSecrets.clientSecret || retries > 0) {
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
        const pmEnv = {
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

        try {
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Save Here',
            });

            if (folders && folders.length > 0) {
                const destinationPath = folders[0].fsPath;
                const postmanEnvJson = JSON.stringify(pmEnv, null, 2);
                const postmanEnvPath = path.join(destinationPath, `${app.clientId}_postman_environment.json`);

                fs.writeFileSync(postmanEnvPath, postmanEnvJson, 'utf8');
                console.log(`${app.clientId}_postman_environment.json written successfully`);
                vscode.window.showInformationMessage(`Postman environment created successfully for Application ${app.clientId}`);
            } else {
                console.log('No destination folder selected. Saving canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to download Postman environment');
            console.error('Error:', error);
        }
    }
}
