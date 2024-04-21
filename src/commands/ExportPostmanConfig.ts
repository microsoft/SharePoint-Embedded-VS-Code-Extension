/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { AppTreeItem } from '../views/treeview/development/AppTreeItem';
import { Command } from './Command';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Static class that handles the Postman export command
export class ExportPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'exportPostmanConfig';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        if (!applicationTreeItem) {
            return;
        }
        
        const message = "This will put your app's secret and other settings in a plain text Postman environment file on your local machine. Are you sure you want to continue?";
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        const account = Account.get()!;

        const app = applicationTreeItem.app;
        const containerType = applicationTreeItem.containerType;

        const tid = account.tenantId;

        const values: any[] = [];
        values.push(
            {
                key: "ClientID",
                value: app.clientId,
                type: "default",
                enabled: true
            },
            {
                key: "ClientSecret",
                value: app.clientSecret,
                type: "secret",
                enabled: true
            },
            {
                key: "ConsumingTenantId",
                value: tid,
                type: "default",
                enabled: true
            },
            {
                key: "RootSiteUrl",
                value: `https://${account.domain}.sharepoint.com/`,
                type: "default",
                enabled: true
            },
            {
                key: "ContainerTypeId",
                value: containerType.containerTypeId,
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
                key: "CertThumbprint",
                value: app.thumbprint,
                type: "default",
                enabled: true
            },
            {
                key: "CertPrivateKey",
                value: app.privateKey,
                type: "secret",
                enabled: true
            }
        );

        const pmEnv = {
            id: uuidv4(),
            name: app.clientId,
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
