/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { Account } from "../../../models/Account";
import { AppTreeItem } from "../../../views/treeview/development/AppTreeItem";
import { Command } from "../../Command";
import * as vscode from 'vscode';
import { ContainerType as OldContainerType } from "../../../models/ContainerType";
import { ContainerType as NewContainerType } from "../../../models/schemas";
import { GuestApplicationTreeItem } from "../../../views/treeview/development/GuestAppTreeItem";
import { OwningAppTreeItem } from "../../../views/treeview/development/OwningAppTreeItem";
import fs from 'fs';
import { exec } from 'child_process';
import { RepoCloneFailure } from "../../../models/telemetry/telemetry";
import { TelemetryProvider } from "../../../services/TelemetryProvider";
import { ProgressWaitNotification } from "../../../views/notifications/ProgressWaitNotification";
import { GraphProvider } from "../../../services/Graph/GraphProvider";
import { AuthenticationState } from "../../../services/AuthenticationState";

// Static class that handles the clone .NET sample app command
export class CloneDotNetSampleApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.SampleApps.ASPNET+C#.clone';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        exec('git --version', (err, stdout, stderr) => {
            if (err) {
                // Git is not installed
                vscode.window.showErrorMessage(vscode.l10n.t('Git is not installed. Please install Git before proceeding.'));
                return;
            }
        });

        if (!applicationTreeItem) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        // Extract app info from tree item
        let appId: string | undefined;
        let objectId: string | undefined;
        let containerType: OldContainerType | NewContainerType | undefined;

        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            const legacyApp = applicationTreeItem.appPerms?.app;
            if (legacyApp) {
                appId = legacyApp.clientId;
                objectId = legacyApp.objectId;
            }
            containerType = applicationTreeItem.appPerms?.containerTypeRegistration?.containerType;
        } else if (applicationTreeItem instanceof OwningAppTreeItem) {
            appId = applicationTreeItem.containerType.owningAppId;
            containerType = applicationTreeItem.containerType;
            // Fetch app to get object ID
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                objectId = app.id;
            }
        }

        if (!appId || !objectId || !containerType) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app or container type'));
            return;
        }

        // Ask if user wants to create a secret for this clone
        let clientSecret: string | undefined;
        const createSecretChoice = await vscode.window.showInformationMessage(
            vscode.l10n.t('Do you want to create a new client secret for this sample app?'),
            vscode.l10n.t('Yes, create secret'),
            vscode.l10n.t('No, skip')
        );

        if (createSecretChoice === vscode.l10n.t('Yes, create secret')) {
            try {
                const credential = await graphProvider.applications.addPassword(objectId, {
                    displayName: '.NET Sample App Secret'
                });
                clientSecret = credential.secretText ?? undefined;
                if (clientSecret) {
                    vscode.window.showInformationMessage(
                        vscode.l10n.t('Client secret created. It will be included in the sample app configuration.')
                    );
                }
            } catch (error: any) {
                console.error('[CloneDotNetSampleApp] Error creating secret:', error);
                vscode.window.showWarningMessage(
                    vscode.l10n.t('Failed to create client secret: {0}. You can add it manually later.', error.message)
                );
            }
        }

        // Warn about plaintext if secret was created
        if (clientSecret) {
            const message = vscode.l10n.t("This will put your app's secret in plain text in configuration files. Are you sure you want to continue?");
            const userChoice = await vscode.window.showInformationMessage(
                message,
                vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
            );

            if (userChoice === vscode.l10n.t('Cancel')) {
                return;
            }
        }

        const appConfigurationProgress = new ProgressWaitNotification(vscode.l10n.t('Configuring your app...'));
        appConfigurationProgress.show();

        // Get tenant info from Account if available, otherwise from auth state
        const account = Account.get();
        const authAccount = AuthenticationState.getCurrentAccountSync();
        const tenantId = account?.tenantId || authAccount?.tenantId || '';
        // Note: App configuration (redirect URIs) requires legacy providers
        // These are skipped in the new flow - user can configure manually if needed
        appConfigurationProgress.hide();

        try {
            const containerTypeId = 'containerTypeId' in containerType ? containerType.containerTypeId : containerType.id;
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

                writeAppSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret || '', tenantId);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to clone Git Repo'));
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
        }
    }
}

const writeAppSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, secretText: string, tenantId: string) => {
    const appSettings = {
        AzureAd: {
            Instance: "https://login.microsoftonline.com/",
            prompt: "select_account",
            TenantId: `${tenantId}`,
            ClientId: `${appId}`,
            CallbackPath: "/signin-oidc",
            SignedOutCallbackPath: "/signout-callback-oidc",
            ClientSecret: `${secretText}`
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