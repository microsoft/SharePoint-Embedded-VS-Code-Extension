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
import { AccountTreeViewProvider, m365AccountStatusChangeHandler } from './treeview/account/accountTreeViewProvider';
import { DevelopmentTreeViewProvider } from './treeview/development/developmentTreeViewProvider';
import { createAppInput } from './qp/createAppInput';
import { CreateAppProvider } from './services/CreateAppProvider';
import { checkJwtForAdminClaim, decodeJwt, getJwtTenantId, } from './utils/token';
import { ApplicationPermissions } from './utils/models';
import { createContainerTypeInput } from './qp/createContainerTypeInput';
import { LocalStorageService, StorageProvider } from './services/StorageProvider';
import Account from './models/Account';

let accessTokenPanel: vscode.WebviewPanel | undefined;
let firstPartyAppAuthProvider: FirstPartyAuthProvider;

export function activate(context: vscode.ExtensionContext) {
    StorageProvider.init(
        new LocalStorageService(context.globalState), 
        new LocalStorageService(context.workspaceState), 
        context.secrets
    );
    vscode.window.registerTreeDataProvider('spe-accounts', AccountTreeViewProvider.getInstance());
    Account.loginToSavedAccount();

    ext.context = context;
    ext.outputChannel = window.createOutputChannel("SharePoint Embedded", { log: true });
    context.subscriptions.push(ext.outputChannel);
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
            Account.login();
            const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All', 'User.Read']);
            const roles = await createAppServiceProvider.graphProvider.checkAdminMemberObjects(accessToken);
            const decodedToken = decodeJwt(accessToken);
            const tid = getJwtTenantId(decodedToken);
            createAppServiceProvider.globalStorageManager.setValue(TenantIdKey, tid);
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

            const appDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue(ThirdPartyAppListKey) || {}

            Object.keys(appDict).forEach(async appId => {
                await ext.context.secrets.delete(appId);
            });

            createAppServiceProvider.globalStorageManager.setValue(ThirdPartyAppListKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(ContainerTypeListKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(AppPermissionsListKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(CurrentApplicationKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(OwningAppIdKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(TenantIdKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(OwningAppIdsListKey, undefined);
            createAppServiceProvider.globalStorageManager.setValue(RegisteredContainerTypeSetKey, undefined);
            developmentTreeViewProvider.refresh();
            checkCacheStateAndInvokeHandler();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createNewAadAppCommand = vscode.commands.registerCommand('spe.createNewAadApp', async (isOwningApp) => {
        const appName = await vscode.window.showInputBox({
            prompt: 'App name:'
        });

        if (!appName) {
            vscode.window.showErrorMessage('No app name provided');
            return;
        }

        const [applicationCreated, appId] = await createAppServiceProvider.createAadApplication(appName);

        if (applicationCreated && isOwningApp) {
            const owningAppIds: string[] = createAppServiceProvider.globalStorageManager.getValue(OwningAppIdsListKey) || [];
            owningAppIds.push(appId);
            createAppServiceProvider.globalStorageManager.setValue(OwningAppIdsListKey, owningAppIds);
        }

        // 20-second progress to allow app propagation before consent flow
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

        // app creation success
        vscode.window.showInformationMessage(`Successfully created 3P application: ${appId}`);
        if (isOwningApp) {
            developmentTreeViewProvider.refresh();
        }
        return appId;
    });

    const createNewContainerTypeCommand = vscode.commands.registerCommand('spe.createNewContainerTypeCommand', async () => {
        const appDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue(ThirdPartyAppListKey) || {};
        const options: any = [];
        Object.keys(appDict).forEach(key => {
            options.push({
                label: appDict[key].displayName,
                appId: key
            })
        });

        const props = {
            title: 'Select owning Azure AD app',
            placeholder: 'Select an option...'
        }

        const target: any = await vscode.window.showQuickPick(options, props);
        const containerTypeName: string | undefined = await vscode.window.showInputBox({
            prompt: 'Container Type name'
        });

        if (!containerTypeName) {
            vscode.window.showErrorMessage('No Container Type Name provided.');
            return;
        }

        const containerTypeCreated = await createAppServiceProvider.createContainerType(target.appId, containerTypeName!);

        if (!containerTypeCreated) {
            vscode.window.showErrorMessage('ContainerType creation failed. Please try again');
            return;
        }

        developmentTreeViewProvider.refresh();
    });

    const registerContainerTypeOnGuestAppCommand = vscode.commands.registerCommand('spe.registerContainerTypeOnGuestAppCommand', async () => {
        const appDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue(ThirdPartyAppListKey) || {};
        const options: any = [];
        Object.keys(appDict).forEach(key => {
            options.push({
                label: appDict[key].displayName,
                appId: key
            })
        });

        const props = {
            title: 'Select owning Azure AD app',
            placeholder: 'Select an option...'
        }

        const target: any = await vscode.window.showQuickPick(options, props);

        const containerTypeCreated = await createAppServiceProvider.createContainerType(target.appId, "");

        if (!containerTypeCreated) {
            vscode.window.showErrorMessage('ContainerType creation failed. Please try again');
            return;
        }
    });


    const registerNewContainerTypeCommand = vscode.commands.registerCommand('spe.registerNewContainerTypeCommand', async (owningAppId, guestAppId) => {
        const containerTypeRegistered = await createAppServiceProvider.registerContainerType(owningAppId, guestAppId)
        if (!containerTypeRegistered) {
            vscode.window.showErrorMessage('ContainerType registration failed. Please try again');
            return;
        }

        //Update Development TreeView
        developmentTreeViewProvider.refresh();
    })

    const createGuestAdApp = vscode.commands.registerCommand('spe.createGuestAdApp', async (owningAppId, guestAppId) => {

        const appId: string = await vscode.commands.executeCommand('spe.createNewAadApp', false)

        // if (!applicationCreated) {
        //     vscode.window.showErrorMessage('Application creation failed. Please try again');
        //     return;
        // }

        await vscode.commands.executeCommand('spe.registerContainerTypeOnGuestAppCommand')

        const containerTypeRegistered = await createAppServiceProvider.registerContainerType(owningAppId, appId)
        if (!containerTypeRegistered) {
            vscode.window.showErrorMessage('ContainerType registration failed. Please try again');
            return;
        }

        //Update Development TreeView
        developmentTreeViewProvider.refresh();
    })

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

                const containerTypeCreated = await createAppServiceProvider.createContainerType(appId, "CT Name");

                if (!containerTypeCreated) {
                    vscode.window.showErrorMessage('ContainerType creation failed. Please try again');
                    return;
                }

                const containerTypeRegistered = await createAppServiceProvider.registerContainerType("", "")
                if (!containerTypeRegistered) {
                    vscode.window.showErrorMessage('ContainerType registration failed. Please try again');
                    return;
                }

                //Update Development TreeView
                developmentTreeViewProvider.refresh();
                const owningAppId: string = createAppServiceProvider.globalStorageManager.getValue(OwningAppIdKey);
                const containerTypeDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue(ContainerTypeListKey) || {};
                const containerTypeId = containerTypeDict[owningAppId].ContainerTypeId
                await vscode.commands.executeCommand('spe.cloneRepo', appId, containerTypeId);
            }
        });
        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    });

    const cloneRepoCommand = vscode.commands.registerCommand('spe.cloneRepo', async (appId, containerTypeId) => {
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
                const secrets = await createAppServiceProvider.getSecretsByAppId(appId);
                writeLocalSettingsJsonFile(destinationPath, appId, containerTypeId, secrets.clientSecret);
                writeAppSettingsJsonFile(destinationPath, appId, containerTypeId, secrets.clientSecret);
                writeEnvFile(destinationPath, appId);
            } else {
                console.log('No destination folder selected. Cloning canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
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


    const createNewAadApplicationCommand = vscode.commands.registerCommand('spe.createNewAadApplicationCommand', async () => {
        try {
            const accessToken = await createAppServiceProvider.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

            const certKeyCredential = createCertKeyCredential(certificatePEM);
            const applicationProps = await createAppServiceProvider.graphProvider.createAadApplication("TestingAppCreate", accessToken, certKeyCredential);

            const appDict: { [key: string]: any } = createAppServiceProvider.globalStorageManager.getValue(ThirdPartyAppListKey) || {};
            appDict[applicationProps.appId] = applicationProps;

            createAppServiceProvider.globalStorageManager.setValue(ThirdPartyAppListKey, appDict);
            createAppServiceProvider.globalStorageManager.setValue(CurrentApplicationKey, applicationProps.appId);

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

    const callMSGraphCommand = vscode.commands.registerCommand('spe.callMSGraphCommand', async () => {
        try {
            const thirdPartyAppId: any = createAppServiceProvider.globalStorageManager.getValue(CurrentApplicationKey);
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

            const tenantDomain = await createAppServiceProvider.graphProvider.getOwningTenantDomain(graphAccessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const spToken = await createAppServiceProvider.thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

            await createAppServiceProvider.pnpProvider.acceptSpeTos(spToken, domain, thirdPartyAppId)
            vscode.window.showInformationMessage(`Successfully accepted ToS on application: ${thirdPartyAppId}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return false;
        }
    })

    const exportPostmanConfig = vscode.commands.registerCommand('spe.exportPostmanConfig', async (appId, containerTypeId) => {
        const secrets = appId && await createAppServiceProvider.getSecretsByAppId(appId);
        const tid = createAppServiceProvider.globalStorageManager.getValue(TenantIdKey);
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
            const appId: any = createAppServiceProvider.globalStorageManager.getValue(CurrentApplicationKey);
            const tid = createAppServiceProvider.globalStorageManager.getValue(TenantIdKey);
            const apps: any = createAppServiceProvider.globalStorageManager.getValue(ThirdPartyAppListKey);
            const cts: any = createAppServiceProvider.globalStorageManager.getValue(ContainerTypeListKey);
            const owningAppId: any = createAppServiceProvider.globalStorageManager.getValue(OwningAppIdKey);
            const secrets = appId && await createAppServiceProvider.getSecretsByAppId(owningAppId) || await createAppServiceProvider.getSecretsByAppId("00a1a4fd-d441-43c3-805b-02d7c5d8ffd7");
            const keys = createAppServiceProvider.globalStorageManager.getAllKeys();
            createAppServiceProvider.globalStorageManager.setValue(RegisteredContainerTypeSetKey, []);
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
        callMSGraphCommand,
        exportPostmanConfig,
        callSpeTosCommand,
        createNewAadAppCommand,
        createGuestAdApp,
        registerContainerTypeOnGuestAppCommand
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