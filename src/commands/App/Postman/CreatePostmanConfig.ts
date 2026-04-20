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

        // Ensure Postman redirect URIs are on the app registration
        await ensurePostmanRedirectUris(graphProvider, objectId, appId);

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

const POSTMAN_REDIRECT_URIS = [
    'https://oauth.pstmn.io/v1/browser-callback',
    'https://oauth.pstmn.io/v1/callback'
];

/**
 * Ensure the app registration has the Postman redirect URIs configured.
 * Adds any missing URIs to web.redirectUris without removing existing ones.
 */
async function ensurePostmanRedirectUris(
    graphProvider: GraphProvider,
    objectId: string,
    appId: string
): Promise<void> {
    try {
        const app = await graphProvider.applications.get(appId, { useAppId: true });
        if (!app) {
            return;
        }

        const existingUris = app.web?.redirectUris ?? [];
        const missingUris = POSTMAN_REDIRECT_URIS.filter(uri => !existingUris.includes(uri));

        if (missingUris.length === 0) {
            return;
        }

        const addUris = vscode.l10n.t('Add redirect URIs');
        const choice = await vscode.window.showInformationMessage(
            vscode.l10n.t(
                'This app registration is missing the required Postman redirect URIs: {0}. Would you like to add them to the "Web" redirect URIs of your app configuration?',
                missingUris.join(', ')
            ),
            addUris,
            vscode.l10n.t('Skip')
        );

        if (choice !== addUris) {
            return;
        }

        await graphProvider.applications.update(app.id!, {
            web: {
                redirectUris: [...existingUris, ...missingUris]
            }
        });

        vscode.window.showInformationMessage(
            vscode.l10n.t('Postman redirect URIs added successfully.')
        );
    } catch (error: any) {
        console.warn('[CreatePostmanConfig] Failed to add Postman redirect URIs:', error.message || error);
        vscode.window.showWarningMessage(
            vscode.l10n.t('Failed to add Postman redirect URIs: {0}', error.message)
        );
    }
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
