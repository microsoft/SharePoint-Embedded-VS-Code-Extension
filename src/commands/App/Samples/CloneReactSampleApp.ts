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

// Static class that handles the clone React sample app command
export class CloneReactSampleApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.SampleApps.TypeScript+React+AzureFunctions.clone';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        exec('git --version', (err, stdout, stderr) => {
            if (err) {
                // Git is not installed
                vscode.window.showErrorMessage('Git is not installed. Please install Git before proceeding.');
                return;
            }
        });
        
        if (!applicationTreeItem) {
            return;
        }
        const message = "This will clone the selected sample and put your app's secret and other settings in plain text in a configuration file on your local machine. Are you sure you want to continue?";
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
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
            }
        }

        try {
            const appId = app.clientId;
            const containerTypeId = containerType.containerTypeId;
            const tenantId = Account.get()!.tenantId;
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
                const subfolder = 'SharePoint-Embedded-Samples/Samples/spa-azurefunction/';

                const folderPathInRepository = path.join(destinationPath, subfolder);
                await vscode.commands.executeCommand('git.clone', repoUrl, destinationPath);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPathInRepository));

                writeLocalSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret, tenantId);
                writeEnvFile(destinationPath, appId, tenantId);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
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
            APP_CLIENT_ID: `${appId}`,
            APP_AUTHORITY: `https://login.microsoftonline.com/${tenantId}`,
            APP_AUDIENCE: `api://${appId}`,
            APP_CLIENT_SECRET: `${secretText}`,
            APP_CONTAINER_TYPE_ID: containerTypeId
        },
        Host: {
            CORS: "*"
        }
    };

    const localSettingsJson = JSON.stringify(localSettings, null, 2);
    const localSettingsPath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spa-azurefunction', 'packages', 'azure-functions', 'local.settings.json');

    fs.writeFileSync(localSettingsPath, localSettingsJson, 'utf8');
};

const writeEnvFile = (destinationPath: string, appId: string, tenantId: string) => {
    const envContent = `REACT_APP_CLIENT_ID='${appId}'\nREACT_APP_TENANT_ID='${tenantId}'`;
    const envFilePath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spa-azurefunction', 'packages', 'client-app', '.env');

    fs.writeFileSync(envFilePath, envContent, 'utf8');
};