/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { generateCertificateAndPrivateKey, acquireAppOnlyCertSPOToken, createCertKeyCredential } from './cert';
import GraphServiceProvider from './services/GraphProvider';
import { clientId } from './utils/constants';
import PnPProvider from './services/PnPProvider';
import { LocalStorageService } from './services/StorageProvider';
import VroomProvider from './services/VroomProvider';
import { ext } from './utils/extensionVariables';
import { ExtensionContext, window } from 'vscode';
import FirstPartyAuthProvider from './services/1PAuthProvider';
import ThirdPartyAuthProvider from './services/3PAuthProvider';
import accountTreeViewProvider, { AccountTreeViewProvider, m365AccountStatusChangeHandler } from './treeview/account/accountTreeViewProvider';
import { DevelopmentTreeViewProvider } from './treeview/development/developmentTreeViewProvider';
import { createAppInput } from './qp/createAppInput';
import { CreateAppProvider } from './services/CreateAppProvider';
import { timeoutForSeconds } from './utils/timeout';
import { checkJwtForAdminClaim, decodeJwt, getJwtTenantId, } from './utils/token';
import { ApplicationPermissions } from './utils/models';

let accessTokenPanel: vscode.WebviewPanel | undefined;
let firstPartyAppAuthProvider: FirstPartyAuthProvider;

export function activate(context: vscode.ExtensionContext) {
    ext.context = context;
    ext.outputChannel = window.createOutputChannel("SharePoint Embedded", { log: true });
    context.subscriptions.push(ext.outputChannel);

    //Initialize storage models
    // let workspaceStorageManager = new LocalStorageService(context.workspaceState);
    // let globalStorageManager = new LocalStorageService(context.globalState);

    // Create service providers
    // let thirdPartyAuthProvider: ThirdPartyAuthProvider;
    // firstPartyAppAuthProvider = new FirstPartyAuthProvider(clientId, consumingTenantId, "1P");
    // const graphProvider = new GraphServiceProvider();
    // const pnpProvider = new PnPProvider();
    // const vroomProvider = new VroomProvider();
    firstPartyAppAuthProvider = new FirstPartyAuthProvider(clientId, "1P");
    const createAppServiceProvider = CreateAppProvider.getInstance(context);


    // Register the TreeView providers
    const accountTreeViewProvider = AccountTreeViewProvider.getInstance();
    const developmentTreeViewProvider = DevelopmentTreeViewProvider.getInstance();
    vscode.window.registerTreeDataProvider('spe-accounts', accountTreeViewProvider);
    vscode.window.registerTreeDataProvider('spe-development', developmentTreeViewProvider);

    checkCacheStateAndInvokeHandler();

    const aadLoginCommand = vscode.commands.registerCommand('spe.login', async () => {
        try {
            const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All', 'User.Read']);
            const roles = await createAppServiceProvider.graphProvider.checkAdminMemberObjects(accessToken);
            const decodedToken = decodeJwt(accessToken);
            const tid = getJwtTenantId(decodedToken);
            createAppServiceProvider.globalStorageManager.setValue("tid", tid);
            const isAdmin = checkJwtForAdminClaim(decodedToken);

            if (isAdmin) {
                vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', true);
            }
            else {
                vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', false);
            }
            showAccessTokenWebview(`1P access token obtained successfully: ${accessToken}`);
            checkCacheStateAndInvokeHandler();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const aadLogoutCommand = vscode.commands.registerCommand('spe.signOut', async () => {
        try {
            await firstPartyAppAuthProvider.logout();

            const appDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue("3PAppList") || {}

            Object.keys(appDict).forEach(async appId => {
                await ext.context.secrets.delete(appId);
            });

            createAppServiceProvider.globalStorageManager.setValue("3PAppList", undefined);
            createAppServiceProvider.globalStorageManager.setValue("ContainerTypeList", undefined);
            createAppServiceProvider.globalStorageManager.setValue("CurrentApplication", undefined);
            checkCacheStateAndInvokeHandler();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createNewSampleAppCommand = vscode.commands.registerCommand('spe.createNewApp', async () => {
        const options: { [key: string]: (context: ExtensionContext) => Promise<{ appName: string }> } = {
            "Node.js SharePoint Embedded App": createAppInput,
            ".NET SharePoint Embedded App": createAppInput
        };
        const quickPick = window.createQuickPick();
        quickPick.title = 'Select the type of sample app';
        quickPick.placeholder = 'Select an option...';
        quickPick.items = Object.keys(options).map(label => ({ label }));
        quickPick.onDidChangeSelection(async selection => {
            if (selection[0]) {
                const state = await options[selection[0].label](context)
                const [applicationCreated, appId] = await createAppServiceProvider.createAadApplication(state.appName);

                if (!applicationCreated) {
                    vscode.window.showErrorMessage('Application creation failed. Please try again');
                    return;
                }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Application Status",
                    cancellable: true
                }, (progress, token) => {
                    token.onCancellationRequested(() => {
                        console.log("User canceled the long running operation");
                    });

                    progress.report({ increment: 0, message: "Creation started" })

                    setTimeout(() => {
                        progress.report({ increment: 25, message: "Configuring properties..." });
                    }, 2000);

                    setTimeout(() => {
                        progress.report({ increment: 25, message: "Configuring properties..." });
                    }, 5000);

                    setTimeout(() => {
                        progress.report({ increment: 25, message: "Configuring properties..." });
                    }, 10000);

                    setTimeout(() => {
                        progress.report({ increment: 25, message: "Almost there..." });
                    }, 15000);

                    const p = new Promise<void>(resolve => {
                        setTimeout(() => {
                            resolve();
                        }, 20000);
                    });

                    return p;
                });

                vscode.window.showInformationMessage(`Successfully created 3P application: ${appId}`);

                const containerTypeCreated = await createAppServiceProvider.createContainerType();

                if (!containerTypeCreated) {
                    vscode.window.showErrorMessage('ContainerType creation failed. Please try again');
                    return;
                }

                const containerTypeRegistered = await createAppServiceProvider.registerContainerType()
                if (!containerTypeRegistered) {
                    vscode.window.showErrorMessage('ContainerType registration failed. Please try again');
                    return;
                }

                await vscode.commands.executeCommand('spe.cloneRepo');
            }
        });
        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    });

    const cloneRepoCommand = vscode.commands.registerCommand('spe.cloneRepo', async () => {
        try {
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
                const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
                const secrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
                writeLocalSettingsJsonFile(destinationPath, secrets.clientSecret);
                writeAppSettingsJsonFile(destinationPath, secrets.clientSecret);
                writeEnvFile(destinationPath);
            } else {
                console.log('No destination folder selected. Cloning canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
            console.error('Error:', error);
        }
    });

    const writeLocalSettingsJsonFile = (destinationPath: string, secretText: string) => {
        const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
        const containerTypeDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList");
        const localSettings = {
            IsEncrypted: false,
            Values: {
                AzureWebJobsStorage: "",
                FUNCTIONS_WORKER_RUNTIME: "node",
                APP_CLIENT_ID: `${thirdPartyAppId}`,
                APP_AUTHORITY: "https://login.microsoftonline.com/common",
                APP_AUDIENCE: `api/${thirdPartyAppId}`,
                APP_CLIENT_SECRET: `${secretText}`,
                APP_CONTAINER_TYPE_ID: containerTypeDict ? `${containerTypeDict[thirdPartyAppId].ContainerTypeId}` : 'NULL'
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
    const writeAppSettingsJsonFile = (destinationPath: string, secretText: string) => {
        const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
        const containerTypeDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList");
        const appSettings = {
            AzureAd: {
                Instance: "https://login.microsoftonline.com/",
                prompt: "select_account",
                TenantId: "common",
                ClientId: `${thirdPartyAppId}`,
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
                "ContainerTypeId": containerTypeDict ? `${containerTypeDict[thirdPartyAppId].ContainerTypeId}` : 'NULL'
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

    const writeEnvFile = (destinationPath: string) => {
        const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
        const envContent = `REACT_APP_CLIENT_ID = '${thirdPartyAppId}'`;
        const envFilePath = path.join(destinationPath, 'syntex-repository-services', 'samples', 'raas-spa-azurefunction', 'packages', 'client-app', '.env');

        fs.writeFileSync(envFilePath, envContent, 'utf8');
        console.log('.env file written successfully.');
    };


    const createNewAadApplicationCommand = vscode.commands.registerCommand('spe.createNewAadApplicationCommand', async () => {
        try {
            const accessToken = await createAppServiceProvider.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

            const certKeyCredential = createCertKeyCredential(certificatePEM);
            const applicationProps = await createAppServiceProvider.graphProvider.createAadApplication("TestingAppCreate", accessToken, certKeyCredential);

            const appDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue("3PAppList") || {};
            appDict[applicationProps.appId] = applicationProps;

            createAppServiceProvider.globalStorageManager.setValue("3PAppList", appDict);
            createAppServiceProvider.globalStorageManager.setValue("CurrentApplication", applicationProps.appId);

            //serialize secrets
            const secrets = {
                thumbprint: thumbprint,
                privateKey: privateKey,
                certificatePEM: certificatePEM
            }
            const serializedSecrets = JSON.stringify(secrets);
            await ext.context.secrets.store(applicationProps.appId, serializedSecrets);

            createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(applicationProps.appId, thumbprint, privateKey);
            vscode.window.showInformationMessage(`Successfully created 3P application: ${applicationProps.appId}`);
            return [true, applicationProps.appId];
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return [false, ""];
        }
    })

    const createNewContainerTypeCommand = vscode.commands.registerCommand('spe.createNewContainerTypeCommand', async () => {
        try {
            const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
            if (typeof createAppServiceProvider.thirdPartyAuthProvider == "undefined" || createAppServiceProvider.thirdPartyAuthProvider == null) {
                const serializedSecrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
                createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, serializedSecrets.thumbprint, serializedSecrets.privateKey)
            }

            const accessToken = await createAppServiceProvider.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            await createAppServiceProvider.graphProvider.getApplicationById(accessToken, thirdPartyAppId)

            const consentToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            const graphAccessToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            // const passwordCredential: any = await createAppServiceProvider.graphProvider.addPassword(graphAccessToken, thirdPartyAppId);
            // await createAppServiceProvider.graphProvider.addIdentifierUri(graphAccessToken, thirdPartyAppId);

            // let secrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
            // secrets.clientSecret = passwordCredential.secretText;
            // await ext.context.secrets.store(thirdPartyAppId, JSON.stringify(secrets));

            const tenantDomain = await createAppServiceProvider.graphProvider.getOwningTenantDomain(graphAccessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const spToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

            const containerTypeDetails = await createAppServiceProvider.pnpProvider.createNewContainerType(spToken, domain, thirdPartyAppId)
            const containerTypeDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList") || {};
            containerTypeDict[thirdPartyAppId] = containerTypeDetails;
            createAppServiceProvider.globalStorageManager.setValue("ContainerTypeList", containerTypeDict);
            vscode.window.showInformationMessage(`ContainerType created successfully: ${containerTypeDetails.ContainerTypeId}`);
            return true
        } catch (error: any) {
            vscode.window.showErrorMessage(error.message);
            console.error('Error:', error.message);
            return false;
        }
    })

    const registerNewContainerTypeCommand = vscode.commands.registerCommand('spe.registerNewContainerTypeCommand', async () => {
        try {
            let thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
            const owningAppId: string = createAppServiceProvider.globalStorageManager.getValue("OwningAppId");
            // Use Owning App Context for registration
            if (owningAppId !== thirdPartyAppId) {
                thirdPartyAppId = owningAppId;
            }
            const tid: any = createAppServiceProvider.globalStorageManager.getValue("tid");
            const secrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
            if (typeof createAppServiceProvider.thirdPartyAuthProvider == "undefined" || createAppServiceProvider.thirdPartyAuthProvider == null) {
                createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, secrets.thumbprint, secrets.privateKey)
            }

            const accessToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const tenantDomain = await createAppServiceProvider.graphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const certThumbprint = await createAppServiceProvider.graphProvider.getCertThumbprintFromApplication(accessToken, thirdPartyAppId);
            const vroomAccessToken = secrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, thirdPartyAppId, domain, secrets.privateKey, tid)
            const containerTypeDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList");
            const appPermissionsDict: { [key: string]: ApplicationPermissions[] } = createAppServiceProvider.globalStorageManager.getValue("AppPermissions");
            const containerTypeId = containerTypeDict[owningAppId].ContainerTypeId;
            await createAppServiceProvider.vroomProvider.registerContainerType(vroomAccessToken, thirdPartyAppId, `https://${domain}.sharepoint.com`, containerTypeId, appPermissionsDict[containerTypeId])
            vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDict[owningAppId].ContainerTypeId} on 3P application: ${thirdPartyAppId}`);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error.response);
            return false;
        }
    })

    const callMSGraphCommand = vscode.commands.registerCommand('spe.callMSGraphCommand', async () => {
        try {
            const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
            if (typeof createAppServiceProvider.thirdPartyAuthProvider == "undefined" || createAppServiceProvider.thirdPartyAuthProvider == null) {
                const serializedSecrets = await createAppServiceProvider.getSecretsByAppId(thirdPartyAppId);
                createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, serializedSecrets.thumbprint, serializedSecrets.privateKey)
            }

            const accessToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const gResponse = await createAppServiceProvider.graphProvider.checkAdminMemberObjects(accessToken)
            console.log(gResponse);
            showAccessTokenWebview(`Obtained Graph Token successfully: ${accessToken}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const exportPostmanConfig = vscode.commands.registerCommand('spe.exportPostmanConfig', async (appId, containerTypeId) => {
        const secrets = appId && await createAppServiceProvider.getSecretsByAppId(appId);
        const tid = createAppServiceProvider.globalStorageManager.getValue("tid");
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, secrets.thumbprint, secrets.privateKey)
        const accessToken = await thirdPartyAuthProvider.getToken(["Organization.Read.All"]);
        const tenantDomain = await createAppServiceProvider.graphProvider.getOwningTenantDomain(accessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const values: any[] = [];
        values.push(
        {
            key: "ClientID",
            value: appId,
            type: "default",
            enabled: true
        },
        {
            key: "ClientSecret",
            value: secrets.clientSecret,
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
            value: containerTypeId,
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
            value: secrets.thumbprint,
            type: "default",
            enabled: true
        },
        {
            key: "CertPrivateKey",
            value: secrets.privateKey,
            type: "secret",
            enabled: true
        }
        );

        const pmEnv = {
            id: uuidv4(),
            name: appId,
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
                const postmanEnvPath = path.join(destinationPath, `${appId}_postman_environment.json`);
        
                fs.writeFileSync(postmanEnvPath, postmanEnvJson, 'utf8');
                console.log(`${appId}_postman_environment.json written successfully`);
                vscode.window.showInformationMessage(`Postman environment created successfully for Application ${appId}`);
            } else {
                console.log('No destination folder selected. Saving canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to download Postman environment');
            console.error('Error:', error);
        }
    })

    const getCertPK = vscode.commands.registerCommand('spe.getCertPK', async () => {
        try {
            const appId: any = createAppServiceProvider.globalStorageManager.getValue("CurrentApplication");
            const tid = createAppServiceProvider.globalStorageManager.getValue("tid");
            const apps: any = createAppServiceProvider.globalStorageManager.getValue("3PAppList");
            const cts: any = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeList");
            const owningAppId: any = createAppServiceProvider.globalStorageManager.getValue("OwningAppId");
            const secrets = appId && await createAppServiceProvider.getSecretsByAppId(owningAppId) || await createAppServiceProvider.getSecretsByAppId("00a1a4fd-d441-43c3-805b-02d7c5d8ffd7");
            const keys = createAppServiceProvider.globalStorageManager.getAllKeys()
            console.log('hi');
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
        createNewSampleAppCommand,
        cloneRepoCommand,
        getCertPK,
        registerNewContainerTypeCommand,
        createNewContainerTypeCommand,
        createNewAadApplicationCommand,
        callMSGraphCommand,
        exportPostmanConfig
        // generateCertificateCommand,
        // getSPToken
    );
}

async function checkAdminStatus() {
    const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
    const isAdmin = checkJwtForAdminClaim(decodeJwt(accessToken));

    if (isAdmin) {
        vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', true);
    }
    else {
        vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', false);
    }
}

// Function to check the cache state and trigger the handler
async function checkCacheStateAndInvokeHandler() {
    const cacheState = await firstPartyAppAuthProvider.checkCacheState();
    if (cacheState === "SignedIn") {
        const accountInfo = await firstPartyAppAuthProvider.getAccount();
        await checkAdminStatus()
        await m365AccountStatusChangeHandler("SignedIn", accountInfo);
    } else if (cacheState === "SignedOut") {
        // Call the handler function for signed-out state
        vscode.commands.executeCommand('setContext', 'spe:isAdminLoggedIn', false);
        await m365AccountStatusChangeHandler("SignedOut", null);
    }
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