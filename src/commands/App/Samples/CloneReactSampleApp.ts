/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { AppTreeItem } from "../../../views/treeview/development/AppTreeItem";
import { Command } from "../../Command";
import * as vscode from 'vscode';
import { ContainerType } from "../../../models/schemas";
import { GuestApplicationTreeItem } from "../../../views/treeview/development/GuestAppTreeItem";
import { OwningAppTreeItem } from "../../../views/treeview/development/OwningAppTreeItem";
import fs from 'fs';
import { exec } from 'child_process';
import { RepoCloneFailure } from "../../../models/telemetry/telemetry";
import { TelemetryProvider } from "../../../services/TelemetryProvider";
import { ProgressWaitNotification } from "../../../views/notifications/ProgressWaitNotification";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
import { AuthenticationState } from "../../../services/AuthenticationState";
import { AdminConsentHelper } from "../../../utils/AdminConsentHelper";

// Static class that handles the clone React sample app command
export class CloneReactSampleApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.SampleApps.TypeScript+React+AzureFunctions.clone';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                exec('git --version', (err) => err ? reject(err) : resolve());
            });
        } catch {
            vscode.window.showErrorMessage(vscode.l10n.t('Git is not installed. Please install Git before proceeding.'));
            return;
        }

        if (!applicationTreeItem) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        // Extract app info from tree item
        let appId: string | undefined;
        let objectId: string | undefined;
        let containerType: ContainerType | undefined;

        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            const app = applicationTreeItem.application;
            if (app) {
                appId = app.appId;
                objectId = app.id;
            }
            const ct = await graphProvider.containerTypes.get(applicationTreeItem.containerTypeId);
            if (ct) {
                containerType = ct;
            }
        } else if (applicationTreeItem instanceof OwningAppTreeItem) {
            appId = applicationTreeItem.containerType.owningAppId;
            containerType = applicationTreeItem.containerType;
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                objectId = app.id;
            }
        }

        if (!appId || !objectId || !containerType) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app or container type'));
            return;
        }

        const appConfigurationProgress = new ProgressWaitNotification(vscode.l10n.t('Configuring your app...'));
        appConfigurationProgress.show();

        // Get tenant info from auth state
        const authAccount = AuthenticationState.getCurrentAccountSync();
        const tenantId = authAccount?.tenantId || '';
        const tenantDomain = extractDomainFromUsername(authAccount?.username);

        // Configure app for React sample (redirect URIs + identifier URI)
        try {
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                const existingSpaUris = app.spa?.redirectUris || [];
                const existingWebUris = app.web?.redirectUris || [];
                const updates: any = {};

                if (!existingSpaUris.includes('http://localhost:8080')) {
                    updates.spa = { redirectUris: [...existingSpaUris, 'http://localhost:8080'] };
                }
                if (!existingWebUris.includes('http://localhost/redirect')) {
                    updates.web = { redirectUris: [...existingWebUris, 'http://localhost/redirect'] };
                }
                if (!app.identifierUris?.includes(`api://${appId}`)) {
                    updates.identifierUris = [`api://${appId}`];
                }

                if (Object.keys(updates).length > 0) {
                    await graphProvider.applications.update(app.id!, updates);
                }

                // Ensure Container.Manage API scope is exposed
                await graphProvider.applications.ensureContainerManageScope(appId, { useAppId: true });

                // Add FileStorageContainer.Selected application permission (for client credentials flow)
                const roleAdded = await graphProvider.applications.ensureFileStorageContainerSelectedRole(appId, { useAppId: true });
                if (roleAdded) {
                    appConfigurationProgress.hide();
                    const grantConsent = vscode.l10n.t('Grant consent');
                    const choice = await vscode.window.showInformationMessage(
                        vscode.l10n.t('Your app {0} requires Graph FileStorageContainer.Selected API permission role to perform this action. Grant admin consent now?', appId),
                        grantConsent,
                        vscode.l10n.t('Skip')
                    );
                    if (choice === grantConsent) {
                        const consentProgress = new ProgressWaitNotification(vscode.l10n.t('Waiting for admin consent...'));
                        consentProgress.show();
                        try {
                            await AdminConsentHelper.listenForAdminConsent(appId, tenantId);
                        } catch (e) {
                            console.warn('[CloneReactSampleApp] Admin consent flow error:', e);
                        }
                        consentProgress.hide();
                    }
                } else {
                    appConfigurationProgress.hide();
                }
            } else {
                appConfigurationProgress.hide();
            }
        } catch (error: any) {
            console.error('[CloneReactSampleApp] Error configuring app:', error);
            appConfigurationProgress.hide();
            // Non-fatal - user can configure manually
        }

        // Prompt to add http://localhost as SPA redirect URI for local development
        try {
            const currentApp = await graphProvider.applications.get(appId, { useAppId: true });
            if (currentApp) {
                const existingSpaUris = currentApp.spa?.redirectUris || [];
                if (!existingSpaUris.includes('http://localhost')) {
                    const addRedirect = vscode.l10n.t('Add redirect URI');
                    const choice = await vscode.window.showInformationMessage(
                        vscode.l10n.t('Would you like to add http://localhost as a SPA redirect URI? This is needed for local development.'),
                        addRedirect,
                        vscode.l10n.t('Skip')
                    );
                    if (choice === addRedirect) {
                        await graphProvider.applications.update(currentApp.id!, {
                            spa: { redirectUris: [...existingSpaUris, 'http://localhost'] }
                        });
                    }
                }
            }
        } catch (error: any) {
            console.error('[CloneReactSampleApp] Error adding SPA redirect URI:', error);
        }

        try {
            const containerTypeId = containerType.id;
            const repoUrl = 'https://github.com/microsoft/SharePoint-Embedded-Samples.git';
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Save',
            });

            if (folders && folders.length > 0) {
                const destinationPath = folders[0].fsPath;
                const subfolder = 'SharePoint-Embedded-Samples/Samples/spe-typescript-react-azurefunction/';

                const folderPathInRepository = path.join(destinationPath, subfolder);
                await vscode.commands.executeCommand('git.clone', repoUrl, destinationPath);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPathInRepository));

                writeLocalSettingsJsonFile(destinationPath, appId, containerTypeId, tenantId);
                writeEnvFile(destinationPath, appId, tenantId, tenantDomain, containerTypeId);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to clone Git Repo'));
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
        }
    }
}

const writeLocalSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, tenantId: string) => {
    const localSettings = {
        IsEncrypted: false,
        Values: {
            AzureWebJobsStorage: "",
            FUNCTIONS_WORKER_RUNTIME: "node",
            AzureWebJobsFeatureFlags: "EnableWorkerIndexing",

            AZURE_SPA_CLIENT_ID: appId,
            AZURE_CLIENT_ID: appId,
            SPE_CONTAINER_TYPE_ID: containerTypeId
        },
        Host: {
            LocalHttpPort: 7072,
            CORS: "*"
        }
    };

    const localSettingsJson = JSON.stringify(localSettings, null, 2);
    const localSettingsPath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spe-typescript-react-azurefunction', 'function-api', 'local.settings.json');

    fs.writeFileSync(localSettingsPath, localSettingsJson, 'utf8');
};

const writeEnvFile = (destinationPath: string, appId: string, tenantId: string, tenantDomain: string, containerTypeId: string) => {
    const envContent = `
REACT_APP_SPO_HOST=${tenantDomain}
REACT_APP_TENANT_ID=${tenantId}

REACT_APP_AZURE_APP_ID=${appId}
REACT_APP_SPE_CONTAINER_TYPE_ID=${containerTypeId}

REACT_APP_SAMPLE_API_URL=http://localhost:7072/api
PORT=8080

`;
    const envFilePath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spe-typescript-react-azurefunction', 'react-client', '.env');

    fs.writeFileSync(envFilePath, envContent, 'utf8');
};

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
