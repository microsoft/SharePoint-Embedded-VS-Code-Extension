/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
// @ts-ignore
import { AccountInfo, AuthenticationResult, AuthorizationUrlRequest, ConfidentialClientApplication, CryptoProvider, LogLevel, PublicClientApplication, SilentFlowRequest } from '@azure/msal-node';
import { htmlString } from '../html/page';


export abstract class BaseAuthProvider {
    protected clientApplication: ConfidentialClientApplication | PublicClientApplication;
    protected account: AccountInfo | null | undefined;
    protected authCodeUrlParams: AuthorizationUrlRequest;

    async getToken(scopes: string[]): Promise<string> {
        let authResponse: AuthenticationResult;
        const account = this.account || await this.getAccount();
        if (account) {
            //authResponse = await this.getTokenSilent({ scopes, account: account });
            authResponse = await this.getTokenSilent({ scopes, account: account, forceRefresh: true });
        } else {
            const authCodeRequest = { scopes, redirectUri: this.authCodeUrlParams.redirectUri };
            authResponse = await this.getTokenInteractive(authCodeRequest);
        }

        return authResponse.accessToken || "";
    }

    async getTokenSilent(tokenRequest: SilentFlowRequest): Promise<AuthenticationResult> {
        try {
            return await this.clientApplication.acquireTokenSilent(tokenRequest);
        } catch (error) {
            console.log("Silent token acquisition failed, acquiring token using pop up");
            const authCodeRequest = { scopes: tokenRequest.scopes, redirectUri: this.authCodeUrlParams.redirectUri };
            return await this.getTokenInteractive(authCodeRequest);
        }
    }

    async getTokenInteractive(request: AuthorizationUrlRequest): Promise<AuthenticationResult> {
        // Generate PKCE Challenge and Verifier before request
        const cryptoProvider = new CryptoProvider();
        const { challenge, verifier } = await cryptoProvider.generatePkceCodes();

        const authCodeUrlParameters: AuthorizationUrlRequest = {
            scopes: request.scopes,
            redirectUri: '',
            codeChallengeMethod: 'S256',
            codeChallenge: challenge, // PKCE Code Challenge
            prompt: 'select_account',
        };

        //const authCodeUrl = await this.clientApplication.getAuthCodeUrl(authCodeUrlParameters);

        try {
            const code = await this.listenForAuthCode(authCodeUrlParameters);
            const tokenResponse = await this.clientApplication.acquireTokenByCode({
                code,
                scopes: request.scopes,
                redirectUri: authCodeUrlParameters.redirectUri,
                codeVerifier: verifier // PKCE Code Verifier
            });
            return tokenResponse;
        } catch (error) {
            console.error('Error getting token:', error);
            throw error;
        }
    }

    async getAccount(): Promise<AccountInfo | null> {
        const cache = this.clientApplication.getTokenCache();
        const currentAccounts = await cache.getAllAccounts();

        if (currentAccounts === null) {
            console.log("No accounts detected");
            return null;
        }

        if (currentAccounts.length > 1) {
            console.log("Multiple accounts detected");
            this.account = currentAccounts[0]
            return currentAccounts[0];
        } else if (currentAccounts.length === 1) {
            this.account = currentAccounts[0]
            return currentAccounts[0];
        } else {
            return null;
        }
    }

    async logout(): Promise<boolean> {
        try {
            const cache = await this.clientApplication.getTokenCache();
            const accounts = await cache.getAllAccounts();
            const account = accounts[0];
            await cache.removeAccount(account);
            this.account = undefined;
            return true
        } catch (e) {
            console.error('Error logging out', e);
            return false;
        }

    }

    async checkCacheState(): Promise<string> {
        try {
            const accounts = await this.clientApplication.getTokenCache().getAllAccounts();
            if (accounts.length > 0) {
                return "SignedIn";
            } else {
                return "SignedOut";
            }
        } catch (error) {
            console.error("Error checking cache state:", error);
            return "Error";
        }
    }

    async listenForAuthCode(authRequest: AuthorizationUrlRequest): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                const queryParams = url.parse(req.url || '', true).query as { code?: string };
                const authCode = queryParams.code;

                if (authCode) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(htmlString);

                    resolve(authCode);

                    server.close(() => {
                        resolve(authCode);
                    });
                } 
                else {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('Authentication failed.');
                    server.close(() => {
                        reject(new Error('No authorization code received.'));
                    });
                }
            });

            //const serverPort = 12345; // Adjust the port as needed
            server.listen(0, async () => {
                const port = (<any>server.address()).port;
                console.log(`Listening on port ${port}`);
                authRequest.redirectUri = `http://localhost:${port}/redirect`;
                const authCodeUrl = await this.clientApplication.getAuthCodeUrl(authRequest);
                vscode.env.openExternal(vscode.Uri.parse(authCodeUrl));
            });
        });
    }

    async applyAdminGrant(url: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                //const queryParams = url.parse(req.url || '', true).query as { code?: string };
                //const authCode = queryParams.code;

                console.log(req.url);
                console.log(res);

                // if (authCode) {
                //     res.writeHead(200, { 'Content-Type': 'text/html' });
                //     res.end('Authentication successful! You can close this window.');
                //     resolve(authCode);

                //     server.close(() => {
                //         resolve(authCode);
                //     });
                // } else {
                //     res.writeHead(400, { 'Content-Type': 'text/html' });
                //     res.end('Authentication failed.');
                //     server.close(() => {
                //         reject(new Error('No authorization code received.'));
                //     });
                // }
            });

            const serverPort = 12345; // Adjust the port as needed
            server.listen(serverPort, () => {
                vscode.env.openExternal(vscode.Uri.parse(url));
            });
        });
    }
}