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

// Static class that handles the clone .NET sample app command
export class CloneDotNetSampleApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.SampleApps.ASPNET+C#.clone';

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

        const account = Account.get()!;
        const requiredUris = [
            account.appProvider.WebRedirectUris.serverAppSignInUri,
            account.appProvider.WebRedirectUris.serverAppSignOnboardingProcessCodeUri,
            account.appProvider.WebRedirectUris.serverAppSignOutUri
        ];

        // Check server app redirect URIs
        try {
            if (!await account.appProvider.checkWebRedirectUris(app, requiredUris)) {
                const userChoice = await vscode.window.showInformationMessage(
                    `This app registration is missing the required server sample app redirect URIs.
                ${requiredUris.join('\n')}. 
                Would you like to add them to the "Web" redirect URIs of your app configuration?`,
                    'OK', 'Skip'
                );
                if (userChoice === 'OK') {
                    await account.appProvider.addWebRedirectUris(app, requiredUris);
                }
            }
        }
        catch (error: any) {
            vscode.window.showErrorMessage('Failed to add redirect URIs: ' + error.message);
            return;
        }


        try {
            const appId = app.clientId;
            const containerTypeId = containerType.containerTypeId;
            const tenantId = account.tenantId;
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
                const subfolder = 'SharePoint-Embedded-Samples/Samples/asp.net-webservice/';

                const folderPathInRepository = path.join(destinationPath, subfolder);
                await vscode.commands.executeCommand('git.clone', repoUrl, destinationPath);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPathInRepository));

                writeAppSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret, tenantId);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
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