import * as msal from '@azure/msal-node';
import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
import { CryptoProvider } from '@azure/msal-node';
import axios from 'axios';
import { clientId, consumingTenantId } from './utils/constants';

export default class AuthProvider {
    private clientApplication: msal.PublicClientApplication;

    constructor() {
        this.clientApplication = new msal.PublicClientApplication({
            auth: {
                clientId: clientId,
                authority: `https://login.microsoftonline.com/${consumingTenantId}/`,
            }
        });
    }

    async getTokenInteractive(tokenRequestScopes: string[] ): Promise<string> {
        // Generate PKCE Challenge and Verifier before request
        const cryptoProvider = new CryptoProvider();
        const { challenge, verifier } = await cryptoProvider.generatePkceCodes();
        
        const authCodeUrlParameters: msal.AuthorizationUrlRequest = {
            scopes: tokenRequestScopes,
            redirectUri: 'http://localhost:12345/redirect',
            codeChallengeMethod: 'S256',
            codeChallenge: challenge, // PKCE Code Challenge
            prompt: 'select_account',
        };

        const authCodeUrl = await this.clientApplication.getAuthCodeUrl(authCodeUrlParameters);

        try {
            const code = await this.listenForAuthCode(authCodeUrl);
            const tokenResponse = await this.clientApplication.acquireTokenByCode({
                code,
                scopes: tokenRequestScopes,
                redirectUri: 'http://localhost:12345/redirect',
                codeVerifier: verifier // PKCE Code Verifier
            });

            //console.log(tokenResponse.accessToken)
            return tokenResponse.accessToken;
        } catch (error) {
            console.error('Error getting token:', error);
            throw error;
        }
    }

    async listenForAuthCode(authCodeUrl: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                const queryParams = url.parse(req.url || '', true).query as { code?: string };
                const authCode = queryParams.code;

                if (authCode) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('Authentication successful! You can close this window.');
                    resolve(authCode);

                    server.close(() => {
                        resolve(authCode);
                    });
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('Authentication failed.');
                    server.close(() => {
                        reject(new Error('No authorization code received.'));
                    });
                }
            });

            const serverPort = 12345; // Adjust the port as needed
            server.listen(serverPort, () => {
                vscode.env.openExternal(vscode.Uri.parse(authCodeUrl));
            });
        });
    }

    async callMicrosoftGraph(accessToken: string) {
        console.log("Calling Microsoft Graph");
        const options = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };
    
        try {
            const response = await axios.get("https://graph.microsoft.com/v1.0/me/drive", options);
            return response.data;
        } catch (error) {
            console.log(error)
            return error;
        }
    };
}