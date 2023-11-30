/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { generateCertificateAndPrivateKey } from './cert';

import { TenantDomain } from './utils/constants';
import { ext } from './utils/extensionVariables';
import { ExtensionContext, window } from 'vscode';
import FirstPartyAuthProvider from './services/1PAuthProvider';
import ThirdPartyAuthProvider from './services/3PAuthProvider';
import { AccountTreeViewProvider } from './treeview/account/accountTreeViewProvider';
import { DevelopmentTreeViewProvider } from './treeview/development/developmentTreeViewProvider';
import { CreateAppProvider } from './services/CreateAppProvider';
import { LocalStorageService, StorageProvider } from './services/StorageProvider';
import { Account } from './models/Account';
import { App } from './models/App';
import SPAdminProvider from './services/SPAdminProvider';
import { BillingClassification, ContainerType } from './models/ContainerType';
import { GuestApplicationsTreeItem } from './treeview/development/guestApplicationsTreeItem';
import { ContainersTreeItem } from './treeview/development/containersTreeItem';
import { ContainerTypeTreeItem } from './treeview/development/containerTypeTreeItem';
import { timeoutForSeconds } from './utils/timeout';
import { AddGuestAppFlow, AddGuestAppFlowState, ContainerTypeCreationFlow, ContainerTypeCreationFlowState } from './qp/UxFlows';

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
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
            await Account.login();
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const aadLogoutCommand = vscode.commands.registerCommand('spe.signOut', async () => {
        try {
            const message = "Are you sure you want to log out? All your SharePoint Embedded data will be forgotten.";
            const userChoice = await vscode.window.showInformationMessage(
                message,
                'OK', 'Cancel'
            );

            if (userChoice === 'Cancel') {
                return;
            }

            await Account.get()!.logout();
            developmentTreeViewProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createTrialContainerTypeCommand = vscode.commands.registerCommand('spe.createTrialContainerType', async () => {
        let account = Account.get()!;

        Account.onContainerTypeCreationStart();
        developmentTreeViewProvider.refresh();

        // Try to use an existing app to see if there's already a Free CT
        let freeCT: ContainerType | undefined;
        try {
            freeCT = await account.getFreeContainerType();
        } catch (error) {
            console.error(`Error fetching Free Trial Container Type: ${error}`);
            Account.onContainerTypeCreationFinish();
            developmentTreeViewProvider.refresh();
        }

        // Get parameters for new App and Container Type or owning App on existing Container Type
        let ctCreationState: ContainerTypeCreationFlowState | undefined;
        try {
            ctCreationState = await new ContainerTypeCreationFlow(freeCT).run();
            if (!ctCreationState) {
                throw new Error("Ux flow cancelled and state is undefined");
            }
        } catch (error) {
            Account.onContainerTypeCreationFinish();
            developmentTreeViewProvider.refresh();
            console.error(`Error with Container Type creation Ux Flow: ${error}`);
            return;
        }

        // Try to get a working application from the Ux flow state provided
        let [app, shouldDelay]: [App | undefined, boolean] = [undefined, false];
        try {
            //let shouldDelay = false;
            vscode.window.showInformationMessage(`Azure AD Application configuring starting...`);
            [app, shouldDelay] = await ctCreationState?.createGetOrImportApp();
            if (!app) {
                throw new Error("App is undefined");
            }
            if (shouldDelay) {
                await showProgress();
            }
            const message = "Grant consent to your new Azure AD application? This step is required in order to create a Free Trial Container Type. This will open a new web browser where you can grant consent with the administrator account on your tenant"
            const userChoice = await vscode.window.showInformationMessage(
                message,
                'OK', 'Cancel'
            );

            if (userChoice !== 'OK') {
                vscode.window.showWarningMessage('You must consent to your new Azure AD application to continue.');
                throw new Error("Consent on app was not accepted.");
            }
            await app.consent();
        } catch (error) {
            Account.onContainerTypeCreationFinish();
            developmentTreeViewProvider.refresh();
            console.error(`Unable to get app: ${error}`);
            return;
        }

        // We should have an app to query Container Types at this point -- use it to do a final check for existing Free CT
        try {
            freeCT = await account.getFreeContainerType(app.clientId);
        } catch (error) {
            Account.onContainerTypeCreationFinish();
            developmentTreeViewProvider.refresh();
            console.error(`Error fetching Free Trial Container Type: ${error}`);
        }

        // If we have a Free CT we need to import it instead of creating a new one
        if (freeCT) {
            // If the owning app on the Free CT is not the app we have, we need to import the owning app
            if (freeCT.owningAppId !== app.clientId) {
                try {
                    ctCreationState = await new ContainerTypeCreationFlow(freeCT).run();
                    if (!ctCreationState) {
                        throw new Error("Ux Flow State is undefined");
                    }
                } catch (error) {
                    Account.onContainerTypeCreationFinish();
                    developmentTreeViewProvider.refresh();
                    console.error(`Error with Container Type creation Ux Flow: ${error}`);
                    return;
                }

                try {
                    vscode.window.showInformationMessage(`Azure AD Application configuring starting...`);
                    [app, shouldDelay] = await ctCreationState?.createGetOrImportApp();
                    if (!app) {
                        throw new Error("App is undefined");
                    }
                    if (shouldDelay) {
                        await showProgress();
                    }
                    const message = "Grant consent to your new Azure AD application? This step is required in order to create a Free Trial Container Type. This will open a new web browser where you can grant consent with the administrator account on your tenant"
                    const userChoice = await vscode.window.showInformationMessage(
                        message,
                        'OK', 'Cancel'
                    );

                    if (userChoice !== 'OK') {
                        vscode.window.showWarningMessage('You must consent to your new Azure AD application to continue.');
                        throw new Error("Consent on app was not accepted.");
                    }
                    await app.consent();
                } catch (error) {
                    Account.onContainerTypeCreationFinish();
                    developmentTreeViewProvider.refresh();
                    console.error(`Unable to get app: ${error}`);
                    return;
                }
            }

            try {
                freeCT = await account.importContainerType(freeCT, app);
                if (!freeCT) {
                    throw new Error("Free CT is undefined");
                }
            } catch (error) {
                Account.onContainerTypeCreationFinish();
                developmentTreeViewProvider.refresh();
                console.error(`Error importing Free Trial Container Type: ${error}`);
                return;
            }

        } else {
            // If we don't have a Free CT, we need to create one
            try {
                vscode.window.showInformationMessage(`${ctCreationState.containerTypeName!} Container Type creation starting...`);
                freeCT = await account.createContainerType(app.clientId, ctCreationState.containerTypeName!, BillingClassification.FreeTrial);
                if (!freeCT) {
                    throw new Error("Free CT is undefined");
                }
            } catch (error: any) {
                if (error.name === 'TermsOfServiceError') {
                    vscode.window.showErrorMessage(error.message);
                } else {
                    vscode.window.showErrorMessage("Unable to create Free Trial Container Type: " + error.message);
                }
                Account.onContainerTypeCreationFinish();
                developmentTreeViewProvider.refresh();
                return;
            }
        }

        // We should have a working app and a Free CT by this point -- now we register the CT on the owning tenant
        vscode.window.showInformationMessage(`Container Type Registration starting...`);
        try {
            await freeCT.addTenantRegistration(account.tenantId, app, ["full"], ["full"]);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
        }

        Account.onContainerTypeCreationFinish();
        developmentTreeViewProvider.refresh();
        vscode.window.showInformationMessage(`Container Type ${ctCreationState.containerTypeName} successfully created and registered on Azure AD App: ${app.displayName}`);
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

        //TODO: understand why CT registration on first run occasionally on a new tenant
        const maxRetries = 3;
        const retryDelay = 5;
        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                await containerType.addTenantRegistration(account.tenantId, app, ["full"], ["full"]);
                // If registration is successful, break out of the loop
                break;
            } catch (error: any) {
                if (retry < maxRetries - 1) {
                    console.error(`Error registering Container Type. Retrying in ${retryDelay / 1000} seconds. Error: ${error.message}`);
                    await timeoutForSeconds(retryDelay);
                } else {
                    vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
                    developmentTreeViewProvider.refresh();
                    return;
                }
            }
        }

        // Register Container Type
        // try {
        //     await containerType.addTenantRegistration(account.tenantId, app, ["full"], ["full"]);
        // } catch (error: any) {
        //     vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
        // }

        vscode.window.showInformationMessage(`Container Type ${containerTypeName} successfully created and registered on Azure AD App: ${app.displayName}`);
        developmentTreeViewProvider.refresh();
    })

    const registerContainerTypeCommand = vscode.commands.registerCommand('spe.registerContainerType', async () => {
        const account = Account.get()!;
        const containerType = account.containerTypes[0]

        try {
            const registrationComplete = await containerType.addTenantRegistration(account.tenantId, containerType.owningApp!, ["full"], ["full"])
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully created and registered on Azure AD App: ${containerType.owningApp?.displayName}`);
            developmentTreeViewProvider.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to register Container Type ${containerType.displayName}: ${error}`)
            return;
        }

    });

    const createGuestApplicationCommand = vscode.commands.registerCommand('spe.createGuestApp', async (guestApplicationsModel: GuestApplicationsTreeItem) => {
        const containerType: ContainerType = guestApplicationsModel.containerType;

        let account = Account.get()!;
        let addGuestAppState: AddGuestAppFlowState | undefined;
        try {
            addGuestAppState = await new AddGuestAppFlow(containerType).run();
            if (addGuestAppState === undefined) {
                return;
            }
        } catch (error) {
            return;
        }

        // Create or import Azure app
        let app: App | undefined;
        try {
            if (addGuestAppState.reconfigureApp) {
                app = await account.importApp(addGuestAppState.appId!, true);
                // 20-second progress to allow app propagation before consent flow
                await showProgress();
            } else if (addGuestAppState.shouldCreateNewApp()) {
                app = await account.createApp(addGuestAppState.appName!, true);
                // 20-second progress to allow app propagation before consent flow
                await showProgress();
            } else {
                // Only other case is the app is already known -- try to get it from Account (should already be consented)
                app = account.apps.find(app => app.clientId === addGuestAppState!.appId!);
            }

            if (!app) {
                throw new Error("");
            }

        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create or import Azure AD application: " + error.message);
            return;
        }

        // Register Container Type
        try {
            await containerType.addTenantRegistration(account.tenantId, app, addGuestAppState.delegatedPerms, addGuestAppState.applicationPerms);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
            return;
        }
        developmentTreeViewProvider.refresh();
        guestApplicationsModel.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    });

    const deleteContainerTypeCommand = vscode.commands.registerCommand('spe.deleteContainerType', async (containerTypeViewModel: ContainerTypeTreeItem) => {
        const message = "Are you sure you delete this Container Type?"
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        vscode.window.showInformationMessage(`Container Type deletion starting...`);

        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;

        try {
            const containerTypeDetails = await account.getContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
            const result = await account.deleteContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully deleted`);
            developmentTreeViewProvider.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to delete Container Type ${containerType.displayName} : ${error.message}`);
            return;
        }

    });

    const renameContainerTypeCommand = vscode.commands.registerCommand('spe.renameContainerType', async (containerTypeViewModel) => {
        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;
        try {
            const containerTypeDetails = await account.getAllContainerTypes(containerType.owningApp!.clientId);
            console.log(containerTypeDetails);
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

    const createContainerCommand = vscode.commands.registerCommand('spe.createContainer', async (containersViewModel: ContainersTreeItem) => {
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
            containersViewModel.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            developmentTreeViewProvider.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create container object: " + error.message);
            return;
        }

    });

    const cloneRepoCommand = vscode.commands.registerCommand('spe.cloneRepo', async (applicationTreeItem) => {
        const message = "This will clone the selected sample and put your app's secret and other settings in plain text in a configuration file on your local machine. Are you sure you want to continue?"
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
            ]

            const sampleAppProps = {
                title: 'Choose a sample app',
                placeholder: 'Select app...',
                canPickMany: false
            }

            const sampleAppSelection: any = await vscode.window.showQuickPick(sampleAppOptions, sampleAppProps);

            if (!sampleAppSelection)
                return;

            const appId = applicationTreeItem && applicationTreeItem.app && applicationTreeItem.app.clientId;
            const containerTypeId = applicationTreeItem && applicationTreeItem.containerType && applicationTreeItem.containerType.containerTypeId;
            const clientSecret = applicationTreeItem && applicationTreeItem.app && applicationTreeItem.app.clientSecret;
            const repoUrl = 'https://github.com/microsoft/syntex-repository-services.git';
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Save',
            });

            if (folders && folders.length > 0) {
                const destinationPath = folders[0].fsPath;
                const subfolder = 'syntex-repository-services/samples/raas-spa-azurefunction/';

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
    });

    const exportPostmanConfig = vscode.commands.registerCommand('spe.exportPostmanConfig', async (applicationTreeItem) => {
        const message = "This will put your app's secret and other settings in a plain text Postman environment file on your local machine. Are you sure you want to continue?"
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        const account = Account.get()!;

        const app = applicationTreeItem && applicationTreeItem.app && applicationTreeItem.app;
        const containerType = applicationTreeItem && applicationTreeItem.containerType;

        const tid = account.tenantId;
        const domain = await StorageProvider.get().global.getValue(TenantDomain);

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
            const account = Account.get()!;
            const app = account.apps.find(app => app.displayName === 'Owning APp')!;
            await account.deleteApp(app);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const callSpeTosCommand = vscode.commands.registerCommand('spe.callSpeTosCommand', async (app: App) => {
        try {
            const account = Account.get()!;
            const appId = app.clientId;
            const appSecretsString = await StorageProvider.get().secrets.get(appId);
            if (!appSecretsString) {
                return undefined;
            }
            const appSecrets = JSON.parse(appSecretsString);
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)

            //const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            // const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/.default"]);
            // const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
            // const parts = tenantDomain.split('.');
            // const domain = parts[0];

            const domain = await StorageProvider.get().global.getValue(TenantDomain);
            const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

            //await SPAdminProvider.acceptSpeTos(spToken, domain, appId)
            vscode.window.showInformationMessage(`Successfully accepted ToS on application: ${appId}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return false;
        }
    })

    const getCertPK = vscode.commands.registerCommand('spe.getCertPK', async () => {
        const keys = StorageProvider.get().global.getAllKeys();
        const account = Account.get();
        const dets = StorageProvider.get().global.getValue("account");
        console.log('hi');
    });

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
        createGuestApplicationCommand,
        createContainerCommand,
        refreshContainerListCommand,
        callMSGraphCommand,
        exportPostmanConfig,
        callSpeTosCommand
    );
}

async function writePostman(app: App) {
    const account = Account.get()!;
    const tid = account.tenantId;
    const domain = await StorageProvider.get().global.getValue(TenantDomain);

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
            { increment: 20, message: "Configuring properties..." },
            { increment: 20, message: "Configuring properties..." },
            { increment: 20, message: "Configuring properties..." },
            { increment: 20, message: "Configuring properties..." },
            { increment: 20, message: "Almost there..." }
        ];

        const reportProgress = (step: any, delay: number) => {
            setTimeout(() => {
                progress.report(step);
            }, delay);
        };

        for (let i = 0; i < progressSteps.length; i++) {
            reportProgress(progressSteps[i], i * 6000); // Adjust the delay as needed
        }

        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, progressSteps.length * 6000);
        });
    });
}

async function ToSDelay() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Terms of Service Status",
        cancellable: true
    }, (progress, token) => {
        token.onCancellationRequested(() => {
            console.log("User canceled the long running operation");
        });

        const progressSteps = [
            { increment: 25, message: "Propagating Terms of Service..." },
            { increment: 25, message: "Please wait..." },
            { increment: 25, message: "Please wait..." },
            { increment: 25, message: "Almost done..." },
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
};