import * as vscode from 'vscode';
import AuthProvider from './auth'; // Update the import path to your AuthProvider file
import { generateCertificateAndPrivateKey, uploadCert } from './cert';

const authProvider = new AuthProvider();
let accessTokenPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    const getTokenCommand = vscode.commands.registerCommand('srs.getToken', async () => {
        try {
            const accessToken = await authProvider.getToken(['Application.ReadWrite.All']);
            //vscode.window.showInformationMessage(`Access token obtained successfully! ${accessToken}`);
            showAccessTokenWebview(accessToken);
            
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const getCSOMTokenCommand = vscode.commands.registerCommand('srs.getCSOMToken', async () => {
        try {
            //const accessToken = await authProvider.getToken(['https://a830edad9050849alexpnp.sharepoint.com/.default']);
            const accessToken = await authProvider.getToken(['Files.Read', 'FileStorageContainer.Selected']);
            showAccessTokenWebview(`CSOM access token obtained successfully! ${accessToken}`);
            const gResponse = await authProvider.callMicrosoftGraph(accessToken)
            console.log(gResponse);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    })

    const generateCertificateCommand = vscode.commands.registerCommand('srs.generateCertificate', () => {
        generateCertificateAndPrivateKey();
    });

    const uploadCertificateCommand = vscode.commands.registerCommand('srs.uploadCertificate', async () => {
        await uploadCert();
        console.log('cert published')
    });

    // Register commands
    context.subscriptions.push(getTokenCommand,
        getCSOMTokenCommand,
        generateCertificateCommand,
        uploadCertificateCommand
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