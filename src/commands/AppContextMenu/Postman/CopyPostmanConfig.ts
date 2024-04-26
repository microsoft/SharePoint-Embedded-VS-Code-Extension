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

// Static class that handles the Postman copy command
export class CopyPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.copyEnvironmentFile';

    // Command handler
    public static async run(applicationTreeItem?: GuestApplicationTreeItem | OwningAppTreeItem): Promise<void> {
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

        let app: App;
        let containerType: ContainerType;

        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            app = applicationTreeItem.appPerms.app!;
            containerType = applicationTreeItem.appPerms.containerTypeRegistration.containerType;
        }

        if (applicationTreeItem instanceof OwningAppTreeItem) {
            app = applicationTreeItem.containerType.owningApp!;
            containerType = applicationTreeItem.containerType;
        }

        const tid = account.tenantId;

        const values: any[] = [];
        values.push(
            {
                key: "ClientID",
                value: app!.clientId,
                type: "default",
                enabled: true
            },
            {
                key: "ClientSecret",
                value: app!.clientSecret,
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
                value: containerType!.containerTypeId,
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
                value: app!.thumbprint,
                type: "default",
                enabled: true
            },
            {
                key: "CertPrivateKey",
                value: app!.privateKey,
                type: "secret",
                enabled: true
            }
        );

        const pmEnv = {
            id: uuidv4(),
            name: app!.clientId,
            values: values,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _postman_variable_scope: "environment",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _postman_exported_at: (new Date()).toISOString(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _postman_exported_using: "Postman/10.13.5"
        };

        try {
            await vscode.env.clipboard.writeText(JSON.stringify(pmEnv, null, 2));
            console.log(`${app!.clientId}_postman_environment.json written successfully`);
            vscode.window.showInformationMessage(`Postman environment copied successfully for Application ${app!.clientId}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to copy Postman environment');
            console.error('Error:', error);
        }
    }
}