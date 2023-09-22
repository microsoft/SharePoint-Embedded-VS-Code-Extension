import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
// @ts-ignore
import { AccountInfo, AuthenticationResult, AuthorizationUrlRequest, CryptoProvider, LogLevel, PublicClientApplication, SilentFlowRequest } from '@azure/msal-node';
import { CachePluginFactory } from '../utils/CacheFactory';
import { ext } from '../utils/extensionVariables';

export default class AuthProvider {
    private clientApplication: PublicClientApplication;
    private account: AccountInfo | null;
    private authCodeUrlParams: AuthorizationUrlRequest;

    constructor(clientId: string, consumingTenantId: string, cacheNamespace: string) {
        const cache = new CachePluginFactory(cacheNamespace);
        this.clientApplication = new PublicClientApplication({
            auth: {
                clientId: clientId,
                authority: `https://login.microsoftonline.com/${consumingTenantId}/`,
            },
            cache: {
                cachePlugin: cache
            },
            system: {
                loggerOptions: {
                    logLevel: LogLevel.Trace,
                    loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
                        if (containsPii) {
                            return;
                        }
						message = 'MSAL: ' + message;
                        switch (level) {
							case LogLevel.Error:
								ext.outputChannel.error(message);
								break;
							case LogLevel.Warning:
								ext.outputChannel.warn(message);
								break;
							case LogLevel.Info:
								ext.outputChannel.info(message);
								break;
							case LogLevel.Verbose:
								ext.outputChannel.debug(message);
								break;
							case LogLevel.Trace:
								ext.outputChannel.trace(message);
								break;
						}
                    },
                    piiLoggingEnabled: false
                }
            }
        });
        this.account = null;
        this.authCodeUrlParams = { scopes: [], redirectUri: 'http://localhost:12345/redirect' }
    }

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
                scopes: request.scopes,
                redirectUri: 'http://localhost:12345/redirect',
                codeVerifier: verifier // PKCE Code Verifier
            });
            return tokenResponse;
        } catch (error) {
            console.error('Error getting token:', error);
            throw error;
        }
    }

    private async getAccount(): Promise<AccountInfo | null> {
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
}