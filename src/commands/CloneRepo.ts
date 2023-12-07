
import { Command } from './Command';
import * as vscode from 'vscode';
import { ContainerType } from '../models/ContainerType';
import { ContainersTreeItem } from '../views/treeview/development/ContainersTreeItem';
import { ApplicationTreeItem } from '../views/treeview/development/ApplicationTreeItem';
import * as fs from 'fs';
import * as path from 'path';

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
            //TODO: update icon paths after demo
            const sampleAppOptions = [
                { "label": "JavaScript + React + Node.js", iconPath: vscode.Uri.parse('https://cdn4.iconfinder.com/data/icons/logos-3/600/React.js_logo-512.png') },
                { "label": "ASP.NET + C#", iconPath: vscode.Uri.parse('https://upload.wikimedia.org/wikipedia/commons/0/0e/Microsoft_.NET_logo.png') },
                { "label": "Teams + SharePoint Embedded" },
                { "label": "Fluid on SharePoint Embedded" },
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
                const subfolder = 'SharePoint-Embedded-Samples/samples/spa-azurefunction/';

                const folderPathInRepository = path.join(destinationPath, subfolder);
                await vscode.commands.executeCommand('git.clone', repoUrl, destinationPath);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPathInRepository));

                console.log(`Repository cloned to: ${destinationPath}`);

                writeLocalSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret);
                writeAppSettingsJsonFile(destinationPath, appId, containerTypeId, clientSecret);
                writeEnvFile(destinationPath, appId);
            } else {
                console.log('No destination folder selected. Cloning canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
            console.error('Error:', error);
        }
    }
}


const writeLocalSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, secretText: string) => {
    const localSettings = {
        IsEncrypted: false,
        Values: {
            AzureWebJobsStorage: "",
            FUNCTIONS_WORKER_RUNTIME: "node",
            APP_CLIENT_ID: `${appId}`,
            APP_AUTHORITY: "https://login.microsoftonline.com/common",
            APP_AUDIENCE: `api://${appId}`,
            APP_CLIENT_SECRET: `${secretText}`,
            APP_CONTAINER_TYPE_ID: containerTypeId
        },
        Host: {
            CORS: "*"
        }
    };

    const localSettingsJson = JSON.stringify(localSettings, null, 2);
    const localSettingsPath = path.join(destinationPath, 'syntex-repository-services', 'samples', 'raas-spa-azurefunction', 'packages', 'azure-functions', 'local.settings.json');

    fs.writeFileSync(localSettingsPath, localSettingsJson, 'utf8');
    console.log('local.settings.json written successfully.');
};
const writeAppSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, secretText: string) => {
    const appSettings = {
        AzureAd: {
            Instance: "https://login.microsoftonline.com/",
            prompt: "select_account",
            TenantId: "common",
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
    const localSettingsPath = path.join(destinationPath, 'syntex-repository-services', 'samples', 'syntex.rs-asp.net-webservice', 'appsettings.json');

    fs.writeFileSync(localSettingsPath, localSettingsJson, 'utf8');
    console.log('appsettings.json written successfully.');
};

const writeEnvFile = (destinationPath: string, appId: string) => {
    const envContent = `REACT_APP_CLIENT_ID = '${appId}'`;
    const envFilePath = path.join(destinationPath, 'syntex-repository-services', 'samples', 'raas-spa-azurefunction', 'packages', 'client-app', '.env');

    fs.writeFileSync(envFilePath, envContent, 'utf8');
    console.log('.env file written successfully.');
};