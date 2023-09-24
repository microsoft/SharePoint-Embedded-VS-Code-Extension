import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
// @ts-ignore
import { AccountInfo, AuthenticationResult, AuthorizationUrlRequest, ConfidentialClientApplication, CryptoProvider, LogLevel, PublicClientApplication, SilentFlowRequest } from '@azure/msal-node';
import { CachePluginFactory } from '../utils/CacheFactory';
import { ext } from '../utils/extensionVariables';
import { BaseAuthProvider } from './BaseAuthProvider';

export default class ThirdPartyAuthProvider extends BaseAuthProvider {
    protected clientApplication: ConfidentialClientApplication;
    protected account: AccountInfo | null;
    protected authCodeUrlParams: AuthorizationUrlRequest;

    constructor(clientId: string, consumingTenantId: string, cacheNamespace: string, thumbprint: string, privateKey: string) {
        super();
        const cache = new CachePluginFactory(clientId);
        this.clientApplication = new ConfidentialClientApplication({
            auth: {
                clientId: clientId,
                authority: `https://login.microsoftonline.com/${consumingTenantId}/`,
                clientCertificate: {
                    thumbprint: thumbprint, // a 40-digit hexadecimal string 
                    privateKey: privateKey,
                }
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

    async getAppToken(scope: string = "https://graph.microsoft.com/.default"): Promise<string> {
        const config = {
            scopes: [scope],
            skipCache: true
        }
        let accessToken;
        try {
            accessToken = await this.clientApplication.acquireTokenByClientCredential(config)
        } catch (error: any) {
            return error.message;
        }
        return accessToken.accessToken;
    }

    async getOBOGraphToken(consentToken: string, scopes: string[]): Promise<string> {
        try {
            const graphTokenRequest = {
                oboAssertion: consentToken,
                scopes: scopes
            };
            const graphToken = (await this.clientApplication.acquireTokenOnBehalfOf(graphTokenRequest)).accessToken;
            return graphToken;
        } catch (error: any) {
            const errorResult = {
                status: 500,
                body: JSON.stringify({
                    message: 'Unable to generate graph obo token: ' + error.message,
                    providedToken: consentToken
                })
            };
            return error.message;
        }
    }
}