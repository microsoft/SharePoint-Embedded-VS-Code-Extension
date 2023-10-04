import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { generateCertificateAndPrivateKey, createKeyCredential, acquireAppOnlyCertSPOToken } from './cert';
import GraphServiceProvider from './services/GraphProvider';
import { clientId, consumingTenantId } from './utils/constants';
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

let accessTokenPanel: vscode.WebviewPanel | undefined;
let firstPartyAppAuthProvider: FirstPartyAuthProvider;

export function activate(context: vscode.ExtensionContext) {
    ext.context = context;
    ext.outputChannel = window.createOutputChannel("Syntex repository services", { log: true });
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
    firstPartyAppAuthProvider = new FirstPartyAuthProvider(clientId, consumingTenantId, "1P");
    const createAppServiceProvider = new CreateAppProvider(context);


    // Register the tree view provider
    const accountTreeViewProvider = AccountTreeViewProvider.getInstance();
    const developmentTreeViewProvider = DevelopmentTreeViewProvider.getInstance();
    vscode.window.registerTreeDataProvider('srs-accounts', accountTreeViewProvider);
    vscode.window.registerTreeDataProvider('srs-development', developmentTreeViewProvider);

    checkCacheStateAndInvokeHandler();

    const aadLoginCommand = vscode.commands.registerCommand('srs.login', async () => {
        try {
            const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            showAccessTokenWebview(`1P access token obtained successfully: ${accessToken}`);
            checkCacheStateAndInvokeHandler();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const aadLogoutCommand = vscode.commands.registerCommand('srs.signOut', async () => {
        try {
            await firstPartyAppAuthProvider.logout();
            checkCacheStateAndInvokeHandler();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createNewSampleAppCommand = vscode.commands.registerCommand('srs.createNewApp', async () => {
        const options: { [key: string]: (context: ExtensionContext) => Promise<{ appName: string }> } = {
            "RaaS Node App": createAppInput
        };
        const quickPick = window.createQuickPick();
        quickPick.title = 'Select the type of sample app';
        quickPick.placeholder = 'Select an option...';
        quickPick.items = Object.keys(options).map(label => ({ label }));
        quickPick.onDidChangeSelection(async selection => {
            if (selection[0]) {
                const state = await options[selection[0].label](context)
                await createAppServiceProvider.createAadApplication(state.appName);
                await timeoutForSeconds(20);
                await createAppServiceProvider.createContainerType();
                await vscode.commands.executeCommand('srs.cloneRepo');
            }
        });
        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    });

    const cloneRepoCommand = vscode.commands.registerCommand('srs.cloneRepo', async () => {
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
                writeLocalSettingsJson(destinationPath);
                writeEnvFile(destinationPath);
            } else {
                console.log('No destination folder selected. Cloning canceled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clone Git Repo');
            console.error('Error:', error);
        }
    });

    const writeLocalSettingsJson = (destinationPath: string) => {
        const thirdPartyAppDetails: any = createAppServiceProvider.globalStorageManager.getValue("NewApplication")
        const localSettings = {
            IsEncrypted: false,
            Values: {
                AzureWebJobsStorage: "",
                FUNCTIONS_WORKER_RUNTIME: "node",
                APP_CLIENT_ID: `${thirdPartyAppDetails["appId"]}`,
                APP_AUTHORITY: "https://login.microsoftonline.com/common",
                APP_AUDIENCE: `api/${thirdPartyAppDetails["appId"]}`,
                APP_CLIENT_SECRET: `${thirdPartyAppDetails["appId"]}`,
                APP_CONTAINER_TYPE_ID: "12345"
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

    const writeEnvFile = (destinationPath: string) => {
        const thirdPartyAppDetails: any = createAppServiceProvider.globalStorageManager.getValue("NewApplication")
        const envContent = `REACT_APP_CLIENT_ID = '${thirdPartyAppDetails["appId"]}'`;
        const envFilePath = path.join(destinationPath, 'syntex-repository-services', 'samples', 'raas-spa-azurefunction', 'packages', 'client-app', '.env');

        fs.writeFileSync(envFilePath, envContent, 'utf8');
        console.log('.env file written successfully.');
    };


    // const createNewAadApplicationCommand = vscode.commands.registerCommand('srs.createNewAadApplicationCommand', async () => {
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

    // const createNewContainerTypeCommand = vscode.commands.registerCommand('srs.createNewContainerTypeCommand', async () => {
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

    // const registerNewContainerTypeCommand = vscode.commands.registerCommand('srs.registerNewContainerTypeCommand', async () => {
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

    //         const pk: string | undefined = await ext.context.secrets.get("3PAppPrivateKey");

    //         const certThumbprint = await graphProvider.getCertThumbprintFromApplication(accessToken, thirdPartyAppDetails["appId"]);
    //         const vroomAccessToken = pk && await acquireAppOnlyCertSPOToken(certThumbprint, thirdPartyAppDetails["appId"], domain, pk)
    //         const containerTypeDetails: any = globalStorageManager.getValue("ContainerTypeDetails");
    //         vroomProvider.registerContainerType(vroomAccessToken, thirdPartyAppDetails["appId"], `https://${domain}.sharepoint.com`, containerTypeDetails['ContainerTypeId'])
    //         vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDetails['ContainerTypeId']} on 3P application: ${thirdPartyAppDetails["appId"]}`);
    //     } catch (error) {
    //         vscode.window.showErrorMessage('Failed to obtain access token.');
    //         console.error('Error:', error);
    //     }
    // })

    // const callMSGraphCommand = vscode.commands.registerCommand('srs.callMSGraphCommand', async () => {
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

    // const getSPToken = vscode.commands.registerCommand('srs.getSPToken', async () => {
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
        vscode.commands.registerCommand('srs.generateCertificate', () => {
            generateCertificateAndPrivateKey();
        });

    // Register commands
    context.subscriptions.push(aadLoginCommand,
        aadLogoutCommand,
        createNewSampleAppCommand,
        cloneRepoCommand
        // createNewAadApplicationCommand,
        // registerNewContainerTypeCommand,
        // createNewContainerTypeCommand,
        // callMSGraphCommand,
        // generateCertificateCommand,
        // getSPToken
    );
}

// Function to check the cache state and trigger the handler
async function checkCacheStateAndInvokeHandler() {
    const cacheState = await firstPartyAppAuthProvider.checkCacheState();
    if (cacheState === "SignedIn") {
        const accountInfo = await firstPartyAppAuthProvider.getAccount();
        await m365AccountStatusChangeHandler("SignedIn", accountInfo);
    } else if (cacheState === "SignedOut") {
        // Call the handler function for signed-out state
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