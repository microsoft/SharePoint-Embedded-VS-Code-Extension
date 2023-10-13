/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { generateCertificateAndPrivateKey, acquireAppOnlyCertSPOToken } from './cert';
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
import { DevelopmentTreeViewProvider } from './treeview/developmentTreeViewProvider';
import { createAppInput } from './qp/createAppInput';
import { CreateAppProvider } from './services/CreateAppProvider';
import { timeoutForSeconds } from './utils/timeout';
import { checkJwtForAdminClaim, decodeJwt, getJwtTenantId, } from './utils/token';

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
    const createAppServiceProvider = new CreateAppProvider(context);


    // Register the TreeView providers
    const accountTreeViewProvider = AccountTreeViewProvider.getInstance();
    const developmentTreeViewProvider = DevelopmentTreeViewProvider.getInstance();
    vscode.window.registerTreeDataProvider('spe-accounts', accountTreeViewProvider);
    vscode.window.registerTreeDataProvider('spe-development', developmentTreeViewProvider);

    checkCacheStateAndInvokeHandler();

    const aadLoginCommand = vscode.commands.registerCommand('spe.login', async () => {
        try {
            const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
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
        
                    progress.report({ increment: 0, message: "Creation started"})
        
                    setTimeout(() => {
                        progress.report({ increment: 20, message: "Configuring properties..." });
                    }, 5000);
        
                    setTimeout(() => {
                        progress.report({ increment: 60, message: "Almost there..." });
                    }, 13000);
        
                    const p = new Promise<void>(resolve => {
                        setTimeout(() => {
                            resolve();
                        }, 18000);
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
                const secretKey: any = await ext.context.secrets.get("3PAppSecret");
                writeLocalSettingsJsonFile(destinationPath, secretKey);
                writeAppSettingsJsonFile(destinationPath, secretKey);
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
        const thirdPartyAppDetails: any = createAppServiceProvider.globalStorageManager.getValue("NewApplication")
        const containerTypeDetails: any = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeDetails")
        const localSettings = {
            IsEncrypted: false,
            Values: {
                AzureWebJobsStorage: "",
                FUNCTIONS_WORKER_RUNTIME: "node",
                APP_CLIENT_ID: `${thirdPartyAppDetails["appId"]}`,
                APP_AUTHORITY: "https://login.microsoftonline.com/common",
                APP_AUDIENCE: `api/${thirdPartyAppDetails["appId"]}`,
                APP_CLIENT_SECRET: `${secretText}`,
                APP_CONTAINER_TYPE_ID: containerTypeDetails ? `${containerTypeDetails['ContainerTypeId']}` : 'NULL'
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
        const thirdPartyAppDetails: any = createAppServiceProvider.globalStorageManager.getValue("NewApplication")
        const containerTypeDetails: any = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeDetails")
        const appSettings = {
            AzureAd: {
                Instance: "https://login.microsoftonline.com/",
                prompt: "select_account",
                TenantId: "common",
                ClientId: `${thirdPartyAppDetails["appId"]}`,
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
                "ContainerTypeId": containerTypeDetails ? `${containerTypeDetails['ContainerTypeId']}` : 'NULL'
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
        const thirdPartyAppDetails: any = createAppServiceProvider.globalStorageManager.getValue("NewApplication")
        const envContent = `REACT_APP_CLIENT_ID = '${thirdPartyAppDetails["appId"]}'`;
        const envFilePath = path.join(destinationPath, 'syntex-repository-services', 'samples', 'raas-spa-azurefunction', 'packages', 'client-app', '.env');

        fs.writeFileSync(envFilePath, envContent, 'utf8');
        console.log('.env file written successfully.');
    };


    // const createNewAadApplicationCommand = vscode.commands.registerCommand('spe.createNewAadApplicationCommand', async () => {
    //     try {

    //         const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
    //         const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

    //         const keyCredential = createKeyCredential(certificatePEM);
    //         const applicationProps = await graphProvider.createAadApplication(accessToken, keyCredential);

    //         globalStorageManager.setValue("NewApplication", applicationProps);
    //         await ext.context.secrets.store("3PAppThumbprint", thumbprint);
    //         await ext.context.secrets.store("3PAppPrivateKey", privateKey);
    //         await ext.context.secrets.store("3PAppCert", certificatePEM);

    //         thirdPartyAuthProvider = new ThirdPartyAuthProvider(applicationProps["appId"], consumingTenantId, "3P", thumbprint, privateKey)
    //         vscode.window.showInformationMessage(`Successfully created 3P application: ${applicationProps["appId"]}`);
    //     } catch (error) {
    //         vscode.window.showErrorMessage('Failed to obtain access token.');
    //         console.error('Error:', error);
    //     }
    // })

    // const createNewContainerTypeCommand = vscode.commands.registerCommand('spe.createNewContainerTypeCommand', async () => {
    //     try {
    //         const thirdPartyAppDetails: any = globalStorageManager.getValue("NewApplication");
    //         if (typeof thirdPartyAuthProvider == "undefined" || thirdPartyAuthProvider == null) {
    //             const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
    //             const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
    //             thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P", thumbprint, pk)
    //         }

    //         const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);

    //         //const graphAccessToken = await thirdPartyAuthProvider.getOBOGraphToken(consentToken, ['Organization.Read.All']);

    //         const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All"]);

    //         const tenantDomain = await graphProvider.getOwningTenantDomain(graphAccessToken);
    //         const parts = tenantDomain.split('.');
    //         const domain = parts[0];

    //         //const accessToken = await thirdPartyAuthProvider.getAppToken(`https://${domain}-admin.sharepoint.com/.default`);

    //         const containerTypeDetails = await pnpProvider.createNewContainerType(consentToken, domain, thirdPartyAppDetails["appId"])
    //         globalStorageManager.setValue("ContainerTypeDetails", containerTypeDetails);
    //         showAccessTokenWebview(`ContainerType created successfully: ${containerTypeDetails}`);
    //     } catch (error) {
    //         vscode.window.showErrorMessage('Failed to obtain access token.');
    //         console.error('Error:', error);
    //     }
    // })

    const registerNewContainerTypeCommand = vscode.commands.registerCommand('spe.registerNewContainerTypeCommand', async () => {
        try {
            const tid: any = createAppServiceProvider.globalStorageManager.getValue("tid");
            const thirdPartyAppDetails: any = createAppServiceProvider.globalStorageManager.getValue("NewApplication");
            if (typeof createAppServiceProvider.thirdPartyAuthProvider == "undefined" || createAppServiceProvider.thirdPartyAuthProvider == null) {
                const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
                const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
                createAppServiceProvider.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"], "3P", thumbprint, pk)
            }

            const accessToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const tenantDomain = await createAppServiceProvider.graphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            let domain = parts[0];

            const pk: string | undefined = await ext.context.secrets.get("3PAppPrivateKey");

            const certThumbprint = await createAppServiceProvider.graphProvider.getCertThumbprintFromApplication(accessToken, thirdPartyAppDetails["appId"]);
            const vroomAccessToken = pk && await acquireAppOnlyCertSPOToken(certThumbprint, thirdPartyAppDetails["appId"], domain, pk, tid) 
            const containerTypeDetails: any = createAppServiceProvider.globalStorageManager.getValue("ContainerTypeDetails");
            await createAppServiceProvider.vroomProvider.registerContainerType(vroomAccessToken, thirdPartyAppDetails["appId"], `https://${domain}.sharepoint.com`, containerTypeDetails['ContainerTypeId'])
            vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDetails['ContainerTypeId']} on 3P application: ${thirdPartyAppDetails["appId"]}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    // const callMSGraphCommand = vscode.commands.registerCommand('spe.callMSGraphCommand', async () => {
    //     try {
    //         const thirdPartyAppDetails: any = globalStorageManager.getValue("NewApplication");
    //         if (typeof thirdPartyAuthProvider == "undefined" || thirdPartyAuthProvider == null) {
    //             const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
    //             const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
    //             thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P", thumbprint, pk)
    //         }

    //         const accessToken = await firstPartyAppAuthProvider.getToken(['https://graph.microsoft.com/.default']);

    //         const gResponse = await graphProvider.getUserDrive(accessToken)
    //         console.log(gResponse);
    //         showAccessTokenWebview(`Obtained Graph Token successfully: ${accessToken}`);
    //     } catch (error) {
    //         vscode.window.showErrorMessage('Failed to obtain access token.');
    //         console.error('Error:', error);
    //     }
    // })

    // const getSPToken = vscode.commands.registerCommand('spe.getSPToken', async () => {
    //     try {
    //         const thirdPartyAppDetails: any = globalStorageManager.getValue("NewApplication");
    //         if (typeof thirdPartyAuthProvider == "undefined" || thirdPartyAuthProvider == null) {
    //             const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
    //             const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
    //             thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P", thumbprint, pk)
    //         }

    //         const accessToken = await thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

    //         const tenantDomain = await graphProvider.getOwningTenantDomain(accessToken);
    //         const parts = tenantDomain.split('.');
    //         const domain = parts[0];

    //         globalStorageManager.setValue("TenantDomain", domain);

    //         showAccessTokenWebview(`Obtained SP Token successfully, tenant domain: ${domain}`);
    //     } catch (error) {
    //         vscode.window.showErrorMessage('Failed to obtain access token.');
    //         console.error('Error:', error);
    //     }
    // })

    const generateCertificateCommand =
        vscode.commands.registerCommand('spe.generateCertificate', () => {
            generateCertificateAndPrivateKey();
        });

    // Register commands
    context.subscriptions.push(aadLoginCommand,
        aadLogoutCommand,
        createNewSampleAppCommand,
        cloneRepoCommand,
        // createNewAadApplicationCommand,
        registerNewContainerTypeCommand,
        // createNewContainerTypeCommand,
        // callMSGraphCommand,
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