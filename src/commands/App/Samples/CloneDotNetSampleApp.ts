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

// Static class that handles the clone .NET sample app command
export class CloneDotNetSampleApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.SampleApps.ASPNET+C#.clone';

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

        const appCheckProgress = new ProgressWaitNotification(vscode.l10n.t('Checking your app configuration...'));
        appCheckProgress.show();

        // Get tenant info from auth state
        const authAccount = AuthenticationState.getCurrentAccountSync();
        const tenantId = authAccount?.tenantId || '';

        // Check app configuration (read-only), then prompt before making changes
        try {
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            appCheckProgress.hide();

            if (app) {
                const existingScopes = app.api?.oauth2PermissionScopes ?? [];
                const needsContainerManageScope = !existingScopes.some((s: any) => s.value === 'Container.Manage');

                const GRAPH_RESOURCE_APP_ID = '00000003-0000-0000-c000-000000000000';
                const FSC_SELECTED_ROLE_ID = '40dc41bc-0f7e-42ff-89bd-d9516947e474';
                const existingRRA = app.requiredResourceAccess ?? [];
                const graphResource = existingRRA.find((r: any) => r.resourceAppId === GRAPH_RESOURCE_APP_ID);
                const existingAccess = graphResource?.resourceAccess ?? [];
                const needsFscRole = !existingAccess.some(
                    (ra: any) => ra.id === FSC_SELECTED_ROLE_ID && ra.type === 'Role'
                );

                if (needsContainerManageScope || needsFscRole) {
                    const missing: string[] = [];
                    if (needsContainerManageScope) { missing.push('Container.Manage API scope'); }
                    if (needsFscRole) { missing.push('FileStorageContainer.Selected permission'); }

                    const configure = vscode.l10n.t('Configure');
                    const choice = await vscode.window.showInformationMessage(
                        vscode.l10n.t('Your app is missing configuration required for this sample: {0}. Add now?', missing.join(', ')),
                        configure,
                        vscode.l10n.t('Skip')
                    );

                    if (choice === configure) {
                        const configProgress = new ProgressWaitNotification(vscode.l10n.t('Configuring your app...'));
                        configProgress.show();
                        try {
                            await graphProvider.applications.ensureContainerManageScope(appId, { useAppId: true });
                            const roleAdded = await graphProvider.applications.ensureFileStorageContainerSelectedRole(appId, { useAppId: true });
                            configProgress.hide();

                            if (roleAdded) {
                                const grantConsent = vscode.l10n.t('Grant consent');
                                const consentChoice = await vscode.window.showInformationMessage(
                                    vscode.l10n.t('Your app {0} requires Graph FileStorageContainer.Selected API permission role to perform this action. Grant admin consent now?', appId),
                                    grantConsent,
                                    vscode.l10n.t('Skip')
                                );
                                if (consentChoice === grantConsent) {
                                    const consentProgress = new ProgressWaitNotification(vscode.l10n.t('Waiting for admin consent...'));
                                    consentProgress.show();
                                    try {
                                        await AdminConsentHelper.listenForAdminConsent(appId, tenantId);
                                    } catch (e) {
                                        console.warn('[CloneDotNetSampleApp] Admin consent flow error:', e);
                                    }
                                    consentProgress.hide();
                                }
                            }
                        } catch (error: any) {
                            configProgress.hide();
                            console.error('[CloneDotNetSampleApp] Error configuring app:', error);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error('[CloneDotNetSampleApp] Error checking app configuration:', error);
            appCheckProgress.hide();
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
            console.error('[CloneDotNetSampleApp] Error adding SPA redirect URI:', error);
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
                const subfolder = 'SharePoint-Embedded-Samples/Samples/asp.net-webservice/';

                const folderPathInRepository = path.join(destinationPath, subfolder);
                await vscode.commands.executeCommand('git.clone', repoUrl, destinationPath);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPathInRepository));

                writeAppSettingsJsonFile(destinationPath, appId, containerTypeId, tenantId);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to clone Git Repo'));
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
        }
    }
}

const writeAppSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, tenantId: string) => {
    const appSettings = {
        AzureAd: {
            Instance: "https://login.microsoftonline.com/",
            prompt: "select_account",
            TenantId: `${tenantId}`,
            ClientId: `${appId}`,
            CallbackPath: "/signin-oidc",
            SignedOutCallbackPath: "/signout-callback-oidc"
        },
        GraphAPI: {
            Endpoint: "https://graph.microsoft.com/v1.0",
            StaticScope: "https://graph.microsoft.com/.default"
        },
        Logging: {
            LogLevel: {
                Default: "Information",
                Microsoft: "Warning",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "Microsoft.Hosting.Lifetime": "Information"
            }
        },
        AllowedHosts: "*",
        TestContainer: {
            "ContainerTypeId": containerTypeId
        },
        ConnectionStrings: {
            AppDBConnStr: "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=DemoAppDb;Integrated Security=True;Connect Timeout=30;",
        },
        Urls: "https://localhost:57750"
    };

    const localSettingsJson = JSON.stringify(appSettings, null, 2);
    const localSettingsPath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'asp.net-webservice', 'appsettings.json');

    fs.writeFileSync(localSettingsPath, localSettingsJson, 'utf8');
};
