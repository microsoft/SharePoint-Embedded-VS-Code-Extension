/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { generateCertificateAndPrivateKey, acquireAppOnlyCertSPOToken, createCertKeyCredential } from './cert';

import { AppPermissionsListKey, ContainerTypeListKey, CurrentApplicationKey, OwningAppIdKey, OwningAppIdsListKey, RegisteredContainerTypeSetKey, TenantIdKey, ThirdPartyAppListKey, clientId } from './utils/constants';
import { ext } from './utils/extensionVariables';
import { ExtensionContext, window } from 'vscode';
import FirstPartyAuthProvider from './services/1PAuthProvider';
import ThirdPartyAuthProvider from './services/3PAuthProvider';
import { AccountTreeViewProvider } from './treeview/account/accountTreeViewProvider';
import { DevelopmentTreeViewProvider } from './treeview/development/developmentTreeViewProvider';
import { CreateAppProvider } from './services/CreateAppProvider';
import { checkJwtForAdminClaim, decodeJwt, getJwtTenantId, } from './utils/token';
import { LocalStorageService, StorageProvider } from './services/StorageProvider';
import { Account } from './models/Account';
import GraphProvider from './services/GraphProvider';
import { App } from './models/App';
import PnPProvider from './services/PnPProvider';
import { BillingClassification, ContainerType } from './models/ContainerType';

let accessTokenPanel: vscode.WebviewPanel | undefined;
let firstPartyAppAuthProvider: FirstPartyAuthProvider;

export async function activate(context: vscode.ExtensionContext) {
    ext.context = context;
    ext.outputChannel = window.createOutputChannel("SharePoint Embedded", { log: true });
    context.subscriptions.push(ext.outputChannel);

    StorageProvider.init(
        new LocalStorageService(context.globalState),
        new LocalStorageService(context.workspaceState),
        context.secrets
    );
    const createAppServiceProvider = CreateAppProvider.getInstance(context);

    vscode.window.registerTreeDataProvider('spe-accounts', AccountTreeViewProvider.getInstance());
    await Account.loginToSavedAccount();
    await Account.get()?.loadFromStorage();

    // Register the TreeView providers
    const developmentTreeViewProvider = DevelopmentTreeViewProvider.getInstance();
    vscode.window.registerTreeDataProvider('spe-development', developmentTreeViewProvider);

    const aadLoginCommand = vscode.commands.registerCommand('spe.login', async () => {
        try {
            Account.login();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const aadLogoutCommand = vscode.commands.registerCommand('spe.signOut', async () => {
        try {
            await Account.get()?.deleteFromStorage();
            await Account.logout();
            developmentTreeViewProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createTrialContainerTypeCommand = vscode.commands.registerCommand('spe.createTrialContainerType', async () => {
        const appName = await vscode.window.showInputBox({
            prompt: 'Azure AD Application Name:'
        });

        if (!appName) {
            vscode.window.showErrorMessage('No Azure AD Application name provided');
            return;
        }

        const containerTypeName = await vscode.window.showInputBox({
            prompt: 'Free Trial Container Type Name:'
        });

        if (!containerTypeName) {
            vscode.window.showErrorMessage('No Container Type name provided');
            return;
        }

        // Create AAD application 
        const account = Account.get()!;
        let app: App | undefined;
        try {
            app = await account.createApp(appName, true);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create Azure AD application: " + error.message);
            return;
        }

        if (!app) {
            vscode.window.showErrorMessage("Unable to create Azure AD application");
            return;
        }

        // 20-second progress to allow app propagation before consent flow
        await showProgress();

        // Create Container Type 
        let containerType: ContainerType | undefined;
        try {
            const message = "Grant consent to your new Azure AD application? This step is required in order to create a Free Trial Container Type. This will open a new web browser where you can grant consent with the administrator account on your tenant"
            const userChoice = await vscode.window.showInformationMessage(
                message,
                'OK', 'Cancel'
            );

            if (userChoice === 'Cancel') {
                vscode.window.showWarningMessage('You must consent to your new Azure AD application to continue.');
                return;
            }

            const result = await app.consent();
            if (!result) {
                vscode.window.showErrorMessage(`Consent failed on app ${app.clientId}`);
                throw new Error();
            }
            containerType = await account.createContainerType(app.clientId, containerTypeName, BillingClassification.FreeTrial);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create Free Trial Container Type: " + error.message);
            account.deleteApp(app);
            return;
        }

        if (!containerType) {
            vscode.window.showErrorMessage("Unable to create Free Trial Container Type");
            return;
        }

        // Register Container Type
        try {
            await containerType.addTenantRegistration(account.tenantId, app, ["full"], ["full"]);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
        }

        vscode.window.showInformationMessage(`Container Type ${containerTypeName} successfully created and registerd on Azure AD App: ${appName}`);
        developmentTreeViewProvider.refresh();
    });

    const createContainerTypeOnApplicationCommand = vscode.commands.registerCommand('spe.createContainerTypeOnApplication', async () => {
         // Create Container Type
         const account = Account.get()!;
         const app = account.apps.find(app => app.displayName === 'Owning')!; 

         const containerTypeName = await vscode.window.showInputBox({
            prompt: 'Free Trial Container Type Name:'
        });

        if (!containerTypeName) {
            vscode.window.showErrorMessage('No Container Type name provided');
            return;
        }

         let containerType: ContainerType | undefined;
         try {
             containerType = await account.createContainerType(app.clientId, containerTypeName, BillingClassification.FreeTrial);
         } catch (error: any) {
             vscode.window.showErrorMessage("Unable to create Free Trial Container Type: " + error.message);
             //account.deleteApp(app);
             return;
         }
 
         if (!containerType) {
             vscode.window.showErrorMessage("Unable to create Free Trial Container Type");
             return;
         }
 
         // Register Container Type
         try {
             await containerType.addTenantRegistration(account.tenantId, app, ["full"], ["full"]);
         } catch (error: any) {
             vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
         }
 
         vscode.window.showInformationMessage(`Container Type ${containerTypeName} successfully created and registerd on Azure AD App: ${app.displayName}`);
        developmentTreeViewProvider.refresh();
    })

    const registerContainerTypeCommand = vscode.commands.registerCommand('spe.registerContainerType', async () => {
        const account = Account.get()!;
        const containerType = account.containerTypes[0]

        try {
            const registrationComplete = await containerType.addTenantRegistration(account.tenantId, containerType.owningApp!, ["full"], ["full"])
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully created and registerd on Azure AD App: ${containerType.owningApp?.displayName}`);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create Azure AD application: " + error.message);
            return;
        }

    });

    const createSecondaryApplicationCommand = vscode.commands.registerCommand('spe.createSecondaryApp', async (secondaryApplicationsModel) => {
        const containerType: ContainerType = secondaryApplicationsModel.containerType;

        const appName = await vscode.window.showInputBox({
            prompt: 'Azure AD Application Name:'
        });

        if (!appName) {
            vscode.window.showErrorMessage('No Azure AD Application name provided');
            return;
        }

        const permissionsOptions = [
            { "label": "none" },
            { "label": "readcontent" },
            { "label": "writecontent" },
            { "label": "create" },
            { "label": "delete" },
            { "label": "read" },
            { "label": "write" },
            { "label": "addpermissions" },
            { "label": "updatepermissions" },
            { "label": "deletepermissions" },
            { "label": "deleteownpermissions" },
            { "label": "managepermissions" },
            { "label": "full" }
        ]

        const delegatedProps = {
            title: 'Delegated Permissions',
            placeholder: 'Select options...',
            canPickMany: true 
        }

        const applicationProps = {
            title: 'Application Permissions',
            placeholder: 'Select options...',
            canPickMany: true 
        }

        const delegatedSelections: any = await vscode.window.showQuickPick(permissionsOptions, delegatedProps);
        const delegatedPermissions = delegatedSelections.map((item: any) => item.label);

        const applicationSelections: any = await vscode.window.showQuickPick(permissionsOptions, applicationProps);
        const applicationPermissions = applicationSelections.map((item: any) => item.label);

        // Create AAD application 
        const account = Account.get()!;
        let app: App | undefined;
        try {
            app = await account.createApp(appName, true);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create Azure AD application: " + error.message);
            return;
        }

        if (!app) {
            vscode.window.showErrorMessage("Unable to create Azure AD application");
            return;
        }

        // 20-second progress to allow app propagation before consent flow
        await showProgress();
        
        // Consent
        try {
            const message = "Grant consent to your new Azure AD application? This step is required in order to create a Free Trial Container Type. This will open a new web browser where you can grant consent with the administrator account on your tenant"
            const userChoice = await vscode.window.showInformationMessage(
                message,
                'OK', 'Cancel'
            );

            if (userChoice === 'Cancel') {
                vscode.window.showWarningMessage('You must consent to your new Azure AD application to continue.');
                return;
            }

            const result = await app.consent();
            if (!result) {
                vscode.window.showErrorMessage(`Consent failed on app ${app.clientId}`);
                throw new Error();
            }
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to consent on app " + error.message);
            account.deleteApp(app);
            return;
        }

        if (!containerType) {
            vscode.window.showErrorMessage("Unable to create Free Trial Container Type");
            return;
        }

        // Register Container Type
        try {
            await containerType.addTenantRegistration(account.tenantId, app, delegatedPermissions, applicationPermissions);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
            return;
        }
        developmentTreeViewProvider.refresh();
        vscode.window.showInformationMessage(`Container Type ${"containerTypeName"} successfully created and registerd on Azure AD App: ${appName}`);
    });

    const deleteContainerTypeCommand = vscode.commands.registerCommand('spe.deleteContainerType', async (containerTypeViewModel) => {
        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;

        try {
            const containerTypeDetails = await account.getContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
            const result = await account.deleteContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
            developmentTreeViewProvider.refresh();

            //await account.deleteContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create Azure AD application: " + error.message);
            return;
        }

    });

    const renameContainerTypeCommand = vscode.commands.registerCommand('spe.renameContainerType', async (containerTypeViewModel) => {
        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;
        try {
            const containerTypeDetails = await account.getContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
            console.log(containerTypeDetails);
            //await account.deleteContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create Azure AD application: " + error.message);
            return;
        }
    });

    const refreshContainerListCommand = vscode.commands.registerCommand('spe.refreshContainerList', async (containersViewModel) => {
        const containerType: ContainerType = containersViewModel.containerType;
        try {
            await containerType.getContainers();
            developmentTreeViewProvider.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to refresh containers list " + error.message);
            return;
        }

    });

    const createContainerCommand = vscode.commands.registerCommand('spe.createContainer', async (containersViewModel) => {
        const containerType: ContainerType = containersViewModel.containerType;
        const containerDisplayName = await vscode.window.showInputBox({
            prompt: 'Display name:'
        });

        if (!containerDisplayName) {
            vscode.window.showErrorMessage('No container display name provided');
            return;
        }

        let containerDescription = await vscode.window.showInputBox({
            prompt: 'Optional description:'
        });

        if (!containerDescription) {
            containerDescription = '';
        }

        try {
            await containerType.createContainer(containerDisplayName, containerDescription);
            developmentTreeViewProvider.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create container object: " + error.message);
            return;
        }

    });

    const cloneRepoCommand = vscode.commands.registerCommand('spe.cloneRepo', async (applicationTreeItem) => {
        try {
            const appId = applicationTreeItem && applicationTreeItem.app && applicationTreeItem.app.clientId;
            const containerTypeId = applicationTreeItem && applicationTreeItem.containerType && applicationTreeItem.containerType.containerTypeId;
            const clientSecret = applicationTreeItem && applicationTreeItem.app && applicationTreeItem.app.clientSecret;
            const repoUrl = 'https://github.com/microsoft/syntex-repository-services.git';
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Clone Here',
            });

            if (folders && folders.length > 0) {
                const destinationPath = folders[0].fsPath;
                await vscode.commands.executeCommand('git.clone', repoUrl, destinationPath);
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
    });

    const exportPostmanConfig = vscode.commands.registerCommand('spe.exportPostmanConfig', async (applicationTreeItem) => {
        const account = Account.get()!;

        const app = applicationTreeItem && applicationTreeItem.app && applicationTreeItem.app;
        const containerType = applicationTreeItem && applicationTreeItem.containerType;

        const tid = account.tenantId;
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(app.clientId, app.thumbprint, app.privateKey)
        const accessToken = await thirdPartyAuthProvider.getToken(["Organization.Read.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(accessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const values: any[] = [];
        values.push(
            {
                key: "ClientID",
                value: app.clientId,
                type: "default",
                enabled: true
            },
            {
                key: "ClientSecret",
                value: app.clientSecret,
                type: "secret",
                enabled: true
            },
            {
                key: "ConsumingTenantId",
                value: tid,
                type: "default",
                enabled: true
            },
            {
                key: "RootSiteUrl",
                value: `https://${domain}.sharepoint.com/`,
                type: "default",
                enabled: true
            },
            {
                key: "ContainerTypeId",
                value: containerType.containerTypeId,
                type: "default",
                enabled: true
            },
            {
                key: "TenantName",
                value: domain,
                type: "default",
                enabled: true
            },

            {
                key: "CertThumbprint",
                value: app.thumbprint,
                type: "default",
                enabled: true
            },
            {
                key: "CertPrivateKey",
                value: app.privateKey,
                type: "secret",
                enabled: true
            }
        );

        const pmEnv = {
            id: uuidv4(),
            name: app.clientId,
            values: values,
            _postman_variable_scope: "environment",
            _postman_exported_at: (new Date()).toISOString(),
            _postman_exported_using: "Postman/10.13.5"
        };

        try {
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Save Here',
            });

            if (folders && folders.length > 0) {
                const destinationPath = folders[0].fsPath;
                const postmanEnvJson = JSON.stringify(pmEnv, null, 2);
                const postmanEnvPath = path.join(destinationPath, `${app.clientId}_postman_environment.json`);

                fs.writeFileSync(postmanEnvPath, postmanEnvJson, 'utf8');
                console.log(`${app.clientId}_postman_environment.json written successfully`);
                vscode.window.showInformationMessage(`Postman environment created successfully for Application ${app.clientId}`);
            } else {
                console.log('No destination folder selected. Saving canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to download Postman environment');
            console.error('Error:', error);
        }
    });

    const writeLocalSettingsJsonFile = (destinationPath: string, appId: string, containerTypeId: string, secretText: string) => {
        const localSettings = {
            IsEncrypted: false,
            Values: {
                AzureWebJobsStorage: "",
                FUNCTIONS_WORKER_RUNTIME: "node",
                APP_CLIENT_ID: `${appId}`,
                APP_AUTHORITY: "https://login.microsoftonline.com/common",
                APP_AUDIENCE: `api/${appId}`,
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
        }

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

    const callMSGraphCommand = vscode.commands.registerCommand('spe.callMSGraphCommand', async () => {
        try {
            const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue(CurrentApplicationKey);
            if (typeof createAppServiceProvider.thirdPartyAuthProvider == "undefined" || createAppServiceProvider.thirdPartyAuthProvider == null) {
                const serializedSecrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
                createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, serializedSecrets.thumbprint, serializedSecrets.privateKey)
            }

            const accessToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const gResponse = await GraphProvider.checkAdminMemberObjects(accessToken)
            console.log(gResponse);
            showAccessTokenWebview(`Obtained Graph Token successfully: ${accessToken}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const callSpeTosCommand = vscode.commands.registerCommand('spe.callSpeTosCommand', async () => {
        try {
            const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue(CurrentApplicationKey);
            if (typeof createAppServiceProvider.thirdPartyAuthProvider == "undefined" || createAppServiceProvider.thirdPartyAuthProvider == null) {
                const serializedSecrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
                createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, serializedSecrets.thumbprint, serializedSecrets.privateKey)
            }

            const consentToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            //const consentToken = await this.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            const graphAccessToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const spToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

            await PnPProvider.acceptSpeTos(spToken, domain, thirdPartyAppId)
            vscode.window.showInformationMessage(`Successfully accepted ToS on application: ${thirdPartyAppId}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return false;
        }
    })

    const getCertPK = vscode.commands.registerCommand('spe.getCertPK', async () => {
        try {
            const keys = StorageProvider.get().global.getAllKeys();
            //createAppServiceProvider.globalStorageManager.setValue(RegisteredContainerTypeSetKey, []);

            const account = Account.get();
            const dets = StorageProvider.get().global.getValue("account");
            const a = StorageProvider.get().global.getValue('d6daab70-24cf-0147-0fe9-ee2d222663b0_52cf1374-86ef-4054-8b6a-d93623f2251d');
            const a_s = await StorageProvider.get().secrets.get("8415b804-a220-4113-8483-371b01d446ad")
            //createAppServiceProvider.globalStorageManager.setValue("apps", apps);
            console.log('hi');
            if (false) {
                keys.forEach(key => {
                    createAppServiceProvider.globalStorageManager.setValue(key, undefined);
                })
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const generateCertificateCommand =
        vscode.commands.registerCommand('spe.generateCertificate', () => {
            generateCertificateAndPrivateKey();
        });

    // Register commands
    context.subscriptions.push(aadLoginCommand,
        aadLogoutCommand,
        cloneRepoCommand,
        getCertPK,
        createTrialContainerTypeCommand,
        deleteContainerTypeCommand,
        registerContainerTypeCommand,
        renameContainerTypeCommand,
        createContainerTypeOnApplicationCommand,
        createSecondaryApplicationCommand,
        createContainerCommand,
        refreshContainerListCommand,
        callMSGraphCommand,
        exportPostmanConfig,
        callSpeTosCommand
        // generateCertificateCommand,
        // getSPToken
    );
}

async function showProgress() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Application Status",
        cancellable: true
    }, (progress, token) => {
        token.onCancellationRequested(() => {
            console.log("User canceled the long running operation");
        });

        const progressSteps = [
            { increment: 0, message: "Creation started" },
            { increment: 25, message: "Configuring properties..." },
            { increment: 25, message: "Configuring properties..." },
            { increment: 25, message: "Configuring properties..." },
            { increment: 25, message: "Almost there..." }
        ];

        const reportProgress = (step: any, delay: number) => {
            setTimeout(() => {
                progress.report(step);
            }, delay);
        };

        for (let i = 0; i < progressSteps.length; i++) {
            reportProgress(progressSteps[i], i * 5000); // Adjust the delay as needed
        }

        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, progressSteps.length * 5000);
        });
    });
}

export function showAccessTokenWebview(accessToken: string) {
    if (accessTokenPanel) {
        accessTokenPanel.webview.html = getAccessTokenHtml(accessToken);
        accessTokenPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        accessTokenPanel = vscode.window.createWebviewPanel(
            'accessToken', // Identifies the type of the webview
            'Access Token', // Title of the panel displayed to the user
            vscode.ViewColumn.Beside, // Editor column to show the webview panel in
            {
                enableScripts: true // Enable JavaScript in the webview
            }
        );

        accessTokenPanel.webview.html = getAccessTokenHtml(accessToken);

        accessTokenPanel.onDidDispose(() => {
            accessTokenPanel = undefined;
        });
    }
}

function getAccessTokenHtml(accessToken: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 20px;
            }
        </style>
    </head>
    <body>
        <h1>Access Token</h1>
        <p>${accessToken}</p>
    </body> 
`;
}