/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { Account } from "../../../models/Account";
import { AppTreeItem } from "../../../views/treeview/development/AppTreeItem";
import { Command } from "../../Command";
import * as vscode from 'vscode';
import { App } from "../../../models/App";
import { ContainerType } from "../../../models/ContainerType";
import { GuestApplicationTreeItem } from "../../../views/treeview/development/GuestAppTreeItem";
import { OwningAppTreeItem } from "../../../views/treeview/development/OwningAppTreeItem";
import fs from 'fs';
import { exec } from 'child_process';
import { CreateSecret } from "../Credentials/CreateSecret";
import { RepoCloneFailure } from "../../../models/telemetry/telemetry";
import { TelemetryProvider } from "../../../services/TelemetryProvider";
import { ProgressWaitNotification } from "../../../views/notifications/ProgressWaitNotification";

// Static class that handles the clone React sample app command
export class CloneReactSampleApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.SampleApps.TypeScript+React+AzureFunctions.clone';

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
        const message = vscode.l10n.t("This will clone the selected sample and put your app's secret and other settings in plain text in a configuration file on your local machine. Are you sure you want to continue?");
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );

        if (userChoice === vscode.l10n.t('Cancel')) {
            return;
        }

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
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app or container type'));
            return;
        }

        const appConfigurationProgress = new ProgressWaitNotification(vscode.l10n.t('Configuring your app...'));
        appConfigurationProgress.show();

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

        const account = Account.get()!;
        const requiredUris = [
            account.appProvider.SpaRedirectUris.reactAppRedirectUri
        ];

        // Check client app redirect URIs
        try {
            if (!await account.appProvider.checkSpaRedirectUris(app, requiredUris)) {
                const message = vscode.l10n.t('This app registration is missing the required React sample app redirect URIs: {0}. Would you like to add them to the "SPA" redirect URIs of your app configuration?', requiredUris.join('\n'));
                const userChoice = await vscode.window.showInformationMessage(message,
                    vscode.l10n.t('OK'), vscode.l10n.t('Skip')
                );
                if (userChoice === vscode.l10n.t('OK')) {
                    await account.appProvider.addSpaRedirectUris(app, requiredUris);
                }
            }
        } catch (error: any) {
            appConfigurationProgress.hide();
            const message = vscode.l10n.t('Failed to add redirect URIs: {0}', error.message);
            vscode.window.showErrorMessage(message);
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
            return;
        }

        // Check Identifier URI
        try {
            if (!await account.appProvider.checkIdentiferUri(app)) {
                const message = vscode.l10n.t('This app registration is missing the required Identifier URI "api:\\\\{0}" to run the sample app. Would you like to add it now?', app.clientId);
                const userChoice = await vscode.window.showInformationMessage(
                    message,
                    vscode.l10n.t('OK'), vscode.l10n.t('Skip')
                );
                if (userChoice === vscode.l10n.t('OK')) {
                    await account.appProvider.addIdentifierUri(app);
                }
            }
        } catch (error: any) {
            appConfigurationProgress.hide();
            const message = vscode.l10n.t('Failed to add Identifier URI: {0}', error.message);
            vscode.window.showErrorMessage(message);
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
            return;
        }

        // Check API scope
        try {
            if (!await account.appProvider.checkApiScope(app)) {
                const message = vscode.l10n.t('This app registration is missing the required API scope Container.Manage to run the sample app. Would you like to add it now?');
                const userChoice = await vscode.window.showInformationMessage(
                    message,
                    vscode.l10n.t('OK'), vscode.l10n.t('Skip')
                );
                if (userChoice === vscode.l10n.t('OK')) {
                    await account.appProvider.addApiScope(app);
                }
            }
        }
        catch (error: any) {
            appConfigurationProgress.hide();
            const message = vscode.l10n.t('Failed to add API scope: {0}', error.message);
            vscode.window.showErrorMessage(message);
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
            return;
        }

        appConfigurationProgress.hide();
        try {
            const appId = app.clientId;
            const containerTypeId = containerType.containerTypeId;
            const tenantId = account.tenantId;
            const tenantDomain = account.domain;
            const clientSecret = appSecrets.clientSecret || '';
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

                writeLocalSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret, tenantId);
                writeEnvFile(destinationPath, appId, tenantId, tenantDomain, containerTypeId);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to clone Git Repo'));
            TelemetryProvider.instance.send(new RepoCloneFailure(error.message));
        }
    }
}

const writeLocalSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, secretText: string, tenantId: string) => {
    const localSettings = {
        IsEncrypted: false,
        Values: {
            AzureWebJobsStorage: "",
            FUNCTIONS_WORKER_RUNTIME: "node",
            AzureWebJobsFeatureFlags: "EnableWorkerIndexing",

            AZURE_SPA_CLIENT_ID: appId,
            AZURE_CLIENT_ID: appId,
            SPE_CONTAINER_TYPE_ID: containerTypeId,
            AZURE_CLIENT_SECRET: secretText
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

REACT_APP_AZURE_SERVER_APP_ID=${appId}
REACT_APP_AZURE_APP_ID=${appId}
REACT_APP_SPE_CONTAINER_TYPE_ID=${containerTypeId}

REACT_APP_SAMPLE_API_URL=http://localhost:7072/api
PORT=8080

`;
    const envFilePath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spe-typescript-react-azurefunction', 'react-client', '.env');

    fs.writeFileSync(envFilePath, envContent, 'utf8');
};