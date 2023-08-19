import * as vscode from 'vscode';
import AuthProvider from './auth'; // Update the import path to your AuthProvider file
import { generateCertificateAndPrivateKey, uploadCert } from './cert';

// Create an instance of AuthProvider
const authProvider = new AuthProvider();

let accessTokenPanel: vscode.WebviewPanel | undefined;

// Activate method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    // Command to initiate the interactive token retrieval
    const getTokenCommand = vscode.commands.registerCommand('syntex-repository-services.getToken', async () => {
        try {
            const accessToken = await authProvider.getTokenInteractive(['Application.ReadWrite.All', 'Files.Read']);
            //vscode.window.showInformationMessage(`Access token obtained successfully! ${accessToken}`);
            showAccessTokenWebview(accessToken);
            const gResponse = await authProvider.callMicrosoftGraph(accessToken)
            console.log(gResponse);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    });

    const generateCertificateCommand = vscode.commands.registerCommand('srs.generateCertificate', () => {
        generateCertificateAndPrivateKey();
    });

    const uploadCertificateCommand = vscode.commands.registerCommand('srs.uploadCertificate', async () => {
        await uploadCert();
        console.log('cert published')
    });

    // Register commands
    context.subscriptions.push(getTokenCommand,
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
    // Define the HTML content for your webview
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