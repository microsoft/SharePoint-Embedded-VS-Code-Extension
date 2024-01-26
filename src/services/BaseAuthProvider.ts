/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
// @ts-ignore
import { AccountInfo, AuthenticationResult, AuthorizationUrlRequest, ConfidentialClientApplication, CryptoProvider, LogLevel, PublicClientApplication, SilentFlowRequest } from '@azure/msal-node';
import { htmlString } from '../views/html/page';

export abstract class BaseAuthProvider {
    protected clientApplication: ConfidentialClientApplication | PublicClientApplication;
    protected account: AccountInfo | null | undefined;
    protected authCodeUrlParams: AuthorizationUrlRequest;
    protected interactiveTokenPrompt: string | undefined;

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
        if (this.interactiveTokenPrompt) {
            const userChoice = await vscode.window.showInformationMessage(
                this.interactiveTokenPrompt,
                { modal: true },
                'OK'
            );

            if (userChoice !== 'OK') {
                vscode.window.showWarningMessage('You must consent to your new Azure AD application to continue.');
                throw new Error("Consent on app was not accepted.");
            }
        }
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

        try {
            const code = await this.listenForAuthCode(authCodeUrlParameters, this.interactiveTokenPrompt);
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

    async grantAdminConsent(scopes: string[], clientId: string, tenantId: string): Promise<boolean> {
        const request: AuthorizationUrlRequest = { scopes: scopes, redirectUri: this.authCodeUrlParams.redirectUri };
        if (this.interactiveTokenPrompt) {
            const userChoice = await vscode.window.showInformationMessage(
                this.interactiveTokenPrompt,
                { modal: true },
                'OK'
            );

            if (userChoice !== 'OK') {
                vscode.window.showWarningMessage('You must consent to your new Azure AD application to continue.');
                throw new Error("Consent on app was not accepted.");
            }
        }
        // Generate PKCE Challenge and Verifier before request
        const cryptoProvider = new CryptoProvider();
        const { challenge, verifier } = await cryptoProvider.generatePkceCodes();
        const authCodeUrlParameters: AuthorizationUrlRequest = {
            scopes: scopes,
            redirectUri: '',
            codeChallengeMethod: 'S256',
            codeChallenge: challenge, // PKCE Code Challenge
            prompt: 'select_account',
        };

        try {
            const code = await this.listenForAuthCodeAdminConsent(authCodeUrlParameters, clientId, tenantId, this.interactiveTokenPrompt);
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
            this.account = currentAccounts[0];
            return currentAccounts[0];
        } else if (currentAccounts.length === 1) {
            this.account = currentAccounts[0];
            return currentAccounts[0];
        } else {
            return null;
        }
    }

    async logout(): Promise<boolean> {
        try {
            const cache = await this.clientApplication.getTokenCache();
            const accounts = await cache.getAllAccounts();
            for (let account of accounts) {
                await cache.removeAccount(account);
            }
            this.account = undefined;
            return true;
        } catch (e) {
            console.error('Error logging out', e);
            return false;
        }
    }

    async listenForAuthCode(authRequest: AuthorizationUrlRequest, interactiveTokenPrompt: string | undefined): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                const queryParams = url.parse(req.url || '', true).query as { code?: string };
                const authCode = queryParams.code;

                if (authCode) {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(htmlString);

                    resolve(authCode);

                    server.close(() => {
                        resolve(authCode);
                    });
                }
                else {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('Authentication failed.');
                    server.close(() => {
                        reject(new Error('No authorization code received.'));
                    });
                }
            });

            // Timeout of 3 minutes (3 * 60 * 1000 = 300000 milliseconds)
            const timeout = setTimeout(() => {
                server.close(() => {
                    reject(new Error('Authorization code not received within the allow timeout.'));
                });
            }, 3 * 60 * 1000);

            server.listen(0, async () => {
                const port = (<any>server.address()).port;
                console.log(`Listening on port ${port}`);
                authRequest.redirectUri = `http://localhost:${port}/redirect`;
                const authCodeUrl = await this.clientApplication.getAuthCodeUrl(authRequest);
                await vscode.env.openExternal(vscode.Uri.parse(authCodeUrl));

                if (interactiveTokenPrompt) {
                    const userChoice = await vscode.window.showInformationMessage(
                        "Seeing an AADSTS165000 error? Try copying the consent link and visiting it in an InPrivate browser.",
                        'Copy Consent Link',
                        'Cancel'
                    );

                    if (userChoice === 'Copy Consent Link') {
                        vscode.env.clipboard.writeText(authCodeUrl);
                    } else {
                        server.close(() => {
                            reject(new Error('Container type creation cancelled.'));
                        });
                    }
                }
            });

            // Clear the timeout if an authorization code is received
            server.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }

    async listenForAuthCodeAdminConsent(authRequest: AuthorizationUrlRequest, clientId: string, tenantId: string, interactiveTokenPrompt: string | undefined): Promise<boolean | string> {
        return new Promise<boolean | string>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                const queryParams = url.parse(req.url || '', true).query as { error?: string, error_description?: string, error_uri?: string, code?: string };
                const authCode = queryParams.code;
                const authError = queryParams.error;
                const authErrorDescription = queryParams.error_description;
                const authErrorUri = queryParams.error_uri;

                if (!authError && !authErrorDescription && !authCode) {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    authRequest.redirectUri = `http://${req.headers.host}/redirect`;
                    const authCodeUrl = await this.clientApplication.getAuthCodeUrl(authRequest);

                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    res.writeHead(302, { 'Location': authCodeUrl, 'Cache-Control': 'no-store' });
                    res.end();
                } else if (authCode) {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(htmlString);
                    
                    resolve(authCode);

                    server.close(() => {
                        resolve(authCode);
                    });
                } else {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(authErrorDescription ? authErrorDescription : 'Authentication failed.');
                    server.close(() => {
                        reject(new Error(authErrorDescription ? authErrorDescription : 'No authorization code received.'));
                    });
                }
            });

            // Timeout of 3 minutes (3 * 60 * 1000 = 300000 milliseconds)
            const timeout = setTimeout(() => {
                server.close(() => {
                    reject(new Error('Authorization code not received within the allow timeout.'));
                });
            }, 3 * 60 * 1000);

            server.listen(0, async () => {
                const port = (<any>server.address()).port;
                console.log(`Listening on port ${port}`);
                const redirectUri = `http://localhost:${port}/redirect`;
                const adminConsentUrl = `https://login.microsoftonline.com/${tenantId}/adminconsent?client_id=${clientId}&redirect_uri=${redirectUri}`;
                await vscode.env.openExternal(vscode.Uri.parse(adminConsentUrl));

                if (interactiveTokenPrompt) {
                    const userChoice = await vscode.window.showInformationMessage(
                        "Seeing an AADSTS165000 error? Try copying the consent link and visiting it in an InPrivate browser.",
                        'Copy Consent Link',
                        'Cancel'
                    );

                    if (userChoice === 'Copy Consent Link') {
                        vscode.env.clipboard.writeText(adminConsentUrl);
                    } else {
                        server.close(() => {
                            reject(new Error('Container type creation cancelled.'));
                        });
                    }
                }
            });

            // Clear the timeout if an authorization code is received
            server.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }
}