/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerType } from "../../../models/schemas";
import { Command } from "../../Command";
import { v4 as uuidv4 } from 'uuid';
import { GraphProvider } from '../../../services/Graph/GraphProvider';
import { AuthenticationState } from '../../../services/AuthenticationState';

/**
 * Input parameters for creating a Postman config
 */
export interface CreatePostmanConfigParams {
    appId: string;
    objectId: string;
    displayName: string;
    containerType: ContainerType;
}

// Static class that handles the Postman config creation command
export class CreatePostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.createConfigFile';

    // Command handler
    public static async run(params?: CreatePostmanConfigParams): Promise<PostmanEnvironmentConfig | undefined> {
        if (!params) {
            return;
        }

        const { appId, objectId, displayName, containerType } = params;
        const graphProvider = GraphProvider.getInstance();

        // Ask user if they want to create a new secret for this export
        let clientSecret: string | undefined;
        const createSecretChoice = await vscode.window.showInformationMessage(
            vscode.l10n.t('Do you want to create a new client secret for this Postman export?'),
            vscode.l10n.t('Yes, create secret'),
            vscode.l10n.t('No, skip')
        );

        if (createSecretChoice === vscode.l10n.t('Yes, create secret')) {
            try {
                const credential = await graphProvider.applications.addPassword(objectId, {
                    displayName: 'SPEVSCodeExtension Postman Secret'
                });
                clientSecret = credential.secretText ?? undefined;
                if (!clientSecret) {
                    throw new Error('Secret was created but secretText was not returned');
                }
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Client secret created. It will be included in the Postman environment.')
                );
            } catch (error: any) {
                console.error('[CreatePostmanConfig] Error creating secret:', error);
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to create client secret: {0}', error.message)
                );
            }
        }

        // Get tenant info
        const authAccount = AuthenticationState.getCurrentAccountSync();
        const tenantId = authAccount?.tenantId || '';
        const domain = extractDomainFromUsername(authAccount?.username);
        const rootSiteUrl = `https://${domain}.sharepoint.com`;

        // Build Postman environment values
        const values: PostmanEnvironmentValue[] = [
            {
                key: "ContainerTypeId",
                value: containerType.id,
                type: "default",
                enabled: true
            },
            {
                key: "ClientID",
                value: appId,
                type: "default",
                enabled: true
            },
            {
                key: "ConsumingTenantId",
                value: tenantId,
                type: "default",
                enabled: true
            },
            {
                key: "TenantName",
                value: domain || '',
                type: "default",
                enabled: true
            },
            {
                key: "RootSiteUrl",
                value: `${rootSiteUrl}/`,
                type: "default",
                enabled: true
            }
        ];

        // Add secret if created
        if (clientSecret) {
            values.push({
                key: "ClientSecret",
                value: clientSecret,
                type: "secret",
                enabled: true
            });
        } else {
            values.push({
                key: "ClientSecret",
                value: "<add your client secret here>",
                type: "secret",
                enabled: true
            });
        }

        const envName = `${containerType.name} (appId ${appId})`;
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

/**
 * Extract domain from username email
 */
function extractDomainFromUsername(username?: string): string {
    if (!username) return '';
    const atIndex = username.indexOf('@');
    if (atIndex === -1) return '';
    const fullDomain = username.substring(atIndex + 1);
    const dotIndex = fullDomain.indexOf('.');
    if (dotIndex !== -1) {
        return fullDomain.substring(0, dotIndex);
    }
    return fullDomain;
}

export interface PostmanEnvironmentValue {
    key: string;
    value: string;
    type: string;
    enabled?: boolean;
}

export type PostmanEnvironmentConfig = {
    id: string;
    name: string;
    values: PostmanEnvironmentValue[];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _postman_variable_scope: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _postman_exported_at: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _postman_exported_using: string;
};
