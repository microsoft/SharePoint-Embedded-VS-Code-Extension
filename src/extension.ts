import * as vscode from 'vscode';
import AuthProvider from './services/AuthProvider.js'; // Update the import path to your AuthProvider file
import { generateCertificateAndPrivateKey, createKeyCredential, acquireAppOnlyCertSPOToken } from './cert.js';
import GraphServiceProvider from './services/GraphProvider.js';
import { clientId, consumingTenantId } from './utils/constants.js';
import PnPProvider from './services/PnPProvider.js';
import { LocalStorageService } from './services/StorageProvider.js';
import VroomProvider from './services/VroomProvider.js';
import { ext } from './utils/extensionVariables.js';


let accessTokenPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    ext.context = context;
    //Initialize storage models
    let workspaceStorageManager = new LocalStorageService(context.workspaceState);
    let globalStorageManager = new LocalStorageService(context.globalState);

    const firstPartyAppAuthProvider = new AuthProvider(clientId, consumingTenantId, "1P");
    let thirdPartyAuthProvider: AuthProvider;

    const graphProvider = new GraphServiceProvider();
    const pnpProvider = new PnPProvider();
    const vroomProvider = new VroomProvider();

    const aadLoginCommand = vscode.commands.registerCommand('srs.login', async () => {
        try {
            const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            showAccessTokenWebview(`1P access token obtained successfully: ${accessToken}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createNewAadApplicationCommand = vscode.commands.registerCommand('srs.createNewAadApplicationCommand', async () => {
        try {
            const accessToken = await firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            const applicationProps = await graphProvider.createAadApplication(accessToken);
            globalStorageManager.setValue("NewApplication", applicationProps);
            thirdPartyAuthProvider = new AuthProvider(applicationProps["appId"], consumingTenantId, "3P")
            //showAccessTokenWebview(`CSOM access token obtained successfully: ${applicationProps}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const createNewContainerTypeCommand = vscode.commands.registerCommand('srs.createNewContainerTypeCommand', async () => {
        try {
            const thirdPartyAppDetails: any = globalStorageManager.getValue("NewApplication");
            if (typeof thirdPartyAuthProvider == "undefined" || thirdPartyAuthProvider == null) {
                thirdPartyAuthProvider = new AuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P")
            }
            
            const graphAccessToken = await thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);
            const tenantDomain = await graphProvider.getOwningTenantDomain(graphAccessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const accessToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

            await pnpProvider.createNewContainerType(accessToken, domain, thirdPartyAppDetails["appId"])
            showAccessTokenWebview(`CSOM access token obtained successfully: ${accessToken}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const registerNewContainerTypeCommand = vscode.commands.registerCommand('srs.registerNewContainerTypeCommand', async () => {
        try {
            const thirdPartyAppDetails: any = workspaceStorageManager.getValue("NewApplication");
            if (typeof thirdPartyAuthProvider == "undefined" || thirdPartyAuthProvider == null) {
                thirdPartyAuthProvider = new AuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P")
            }

            const accessToken = await thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const tenantDomain = await graphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            //@ts-ignore
            //vscode.secrets.store('myExtensionAccessToken', accessToken);
            generateCertificateAndPrivateKey();
            const keyCredential = createKeyCredential();
            await graphProvider.uploadKeyCredentialToApplication(accessToken, thirdPartyAppDetails["appId"], keyCredential);
            const certThumbprint = await graphProvider.getCertThumbprintFromApplication(accessToken, thirdPartyAppDetails["appId"]);
            const vroomAccessToken = await acquireAppOnlyCertSPOToken(certThumbprint, thirdPartyAppDetails["appId"], domain)
            vroomProvider.registerContainerType(vroomAccessToken, thirdPartyAppDetails["appId"], `https://${domain}.sharepoint.com`, "9f725df3-d9a1-4a9b-8dcd-7fe5adab37a4")
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const callMSGraphCommand = vscode.commands.registerCommand('srs.callMSGraphCommand', async () => {
        try {
            const thirdPartyAppDetails: any = globalStorageManager.getValue("NewApplication");
            if (typeof thirdPartyAuthProvider == "undefined" || thirdPartyAuthProvider == null) {
                thirdPartyAuthProvider = new AuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P")
            }
            
            const accessToken = await thirdPartyAuthProvider.getToken([`https://graph.microsoft.com/.default`]);
            showAccessTokenWebview(`Obtained Graph Token successfully: ${accessToken}`);
            const gResponse = await graphProvider.getUserDrive(accessToken)
            console.log(gResponse);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const generateCertificateCommand =
        vscode.commands.registerCommand('srs.generateCertificate', () => {
            generateCertificateAndPrivateKey();
        });

    // Register commands
    context.subscriptions.push(aadLoginCommand,
        createNewAadApplicationCommand,
        registerNewContainerTypeCommand,
        createNewContainerTypeCommand,
        callMSGraphCommand,
        generateCertificateCommand
    );
}

function showAccessTokenWebview(accessToken: string) {
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