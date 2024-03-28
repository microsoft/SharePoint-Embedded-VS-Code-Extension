/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './Command';
import * as vscode from 'vscode';
import { ApplicationTreeItem } from '../views/treeview/development/ApplicationTreeItem';
import * as fs from 'fs';
import * as path from 'path';
import { ext } from '../utils/extensionVariables';

// Static class that handles the sign in command
export class CloneRepo extends Command {
    // Command name
    public static readonly COMMAND = 'cloneRepo';

    // Command handler
    public static async run(applicationTreeItem?: ApplicationTreeItem): Promise<void> {
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

        try {
            const sampleAppOptions = [
                { "label": "JavaScript + React + Node.js", iconPath: vscode.Uri.file(ext.context.asAbsolutePath('media/react.png')) },
                { "label": "ASP.NET + C#", iconPath: vscode.Uri.file(ext.context.asAbsolutePath('media/dotnet.png')) }
            ];

            const sampleAppProps = {
                title: 'Choose a sample app',
                placeholder: 'Select app...',
                canPickMany: false
            };

            const sampleAppSelection: any = await vscode.window.showQuickPick(sampleAppOptions, sampleAppProps);

            if (!sampleAppSelection) {
                return;
            }

            const appId = applicationTreeItem.app.clientId;
            const containerTypeId = applicationTreeItem.containerType.containerTypeId;
            const tenantId = applicationTreeItem.app.tenantId || '';
            const clientSecret = applicationTreeItem.app.clientSecret || '';
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

                console.log(`Repository cloned to: ${destinationPath}`);

                writeLocalSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret, tenantId);
                writeAppSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret, tenantId);
                writeEnvFile(destinationPath, appId, tenantId);
            } else {
                console.log('No destination folder selected. Cloning canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
            console.error('Error:', error);
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
    console.log('local.settings.json written successfully.');
};
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
    console.log('appsettings.json written successfully.');
};

const writeEnvFile = (destinationPath: string, appId: string, tenantId: string) => {
    const envContent = `REACT_APP_CLIENT_ID='${appId}'\nREACT_APP_TENANT_ID='${tenantId}'`;
    const envFilePath = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spa-azurefunction', 'packages', 'client-app', '.env');

    fs.writeFileSync(envFilePath, envContent, 'utf8');
    console.log('.env file written successfully.');
};