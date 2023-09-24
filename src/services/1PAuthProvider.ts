import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
// @ts-ignore
import { AccountInfo, AuthenticationResult, AuthorizationUrlRequest, ConfidentialClientApplication, CryptoProvider, LogLevel, PublicClientApplication, SilentFlowRequest } from '@azure/msal-node';
import { CachePluginFactory } from '../utils/CacheFactory';
import { ext } from '../utils/extensionVariables';
import { BaseAuthProvider } from './BaseAuthProvider';

export default class FirstPartyAuthProvider extends BaseAuthProvider {
    protected clientApplication: PublicClientApplication;
    protected account: AccountInfo | null;
    protected authCodeUrlParams: AuthorizationUrlRequest;

    constructor(clientId: string, consumingTenantId: string, cacheNamespace: string) {
        super();
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
}