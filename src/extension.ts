import * as vscode from 'vscode';
import AuthProvider from './services/AuthProvider.js'; // Update the import path to your AuthProvider file
import { generateCertificateAndPrivateKey, createKeyCredential, acquireAppOnlyCertSPOToken } from './cert.js';
import GraphServiceProvider from './services/GraphProvider.js';
import { clientId } from './utils/constants.js';
//import PnPProvider from './utils/pnp.js';

const authProvider = new AuthProvider();
const graphProvider = new GraphServiceProvider();
//const pnpProvider: any = new PnPProvider();
let accessTokenPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    const aadLoginCommand = vscode.commands.registerCommand('srs.login', async () => {
        try {
            const accessToken = await authProvider.getToken(['Application.ReadWrite.All']);
            
            const secrets = context['secrets']; //SecretStorage-object
            await secrets.store('AccessToken', accessToken); //Save a secret
            const mySecret = await secrets.get('AccessToken'); //Get a secret

            console.log(`mySecret1: '${mySecret}'`); //Print
            showAccessTokenWebview(mySecret!);

        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const createNewAadApplicationCommand = vscode.commands.registerCommand('srs.createNewAadApplicationCommand', async () => {
        try {
            const accessToken = await authProvider.getToken(['Application.ReadWrite.All']);
            const applicationProps = await graphProvider.createAadApplication(accessToken);
            showAccessTokenWebview(`CSOM access token obtained successfully: ${applicationProps}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const createNewContainerTypeCommand = vscode.commands.registerCommand('srs.createNewContainerTypeCommand', async () => {
        try {
            const accessToken = await authProvider.getToken(['https://a830edad9050849alexpnp.sharepoint.com/.default']);
            //await pnpProvider.createNewContainerType(accessToken, "a830edad9050849alexpnp")
            showAccessTokenWebview(`CSOM access token obtained successfully: ${accessToken}`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const registerNewContainerTypeCommand = vscode.commands.registerCommand('srs.registerNewContainerTypeCommand', async () => {
        try {
            const accessToken = await authProvider.getToken(['Application.ReadWrite.All']);
            //@ts-ignore
            vscode.secrets.store('myExtensionAccessToken', accessToken);
            generateCertificateAndPrivateKey();
            const keyCredential = createKeyCredential();
            await graphProvider.uploadKeyCredentialToApplication(accessToken, clientId, keyCredential);
            const certThumbprint = await graphProvider.getCertThumbprintFromApplication(accessToken, clientId);
            const vroomAccessToken = acquireAppOnlyCertSPOToken(certThumbprint)
            // call Vroom
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const callMSGraphCommand = vscode.commands.registerCommand('srs.callMSGraphCommand', async () => {
        try {
            const accessToken = await authProvider.getToken(['Files.Read']);
            showAccessTokenWebview(`Obtained Graph Token successfully: ${accessToken}`);
            const gResponse = await graphProvider.getUserDrive(accessToken)
            console.log(gResponse);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const generateCertificateCommand = vscode.commands.registerCommand('srs.generateCertificate', () => {
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
        </html>
    `;
}