/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore
import { AccountInfo, AuthorizationUrlRequest, LogLevel, PublicClientApplication } from '@azure/msal-node';
import { CachePluginFactory } from '../utils/CacheFactory';
import { ext } from '../utils/extensionVariables';
import { BaseAuthProvider } from './BaseAuthProvider';

export default class FirstPartyAuthProvider extends BaseAuthProvider {
    private static instance: FirstPartyAuthProvider;
    protected clientApplication: PublicClientApplication;
    protected account: AccountInfo | null;
    protected authCodeUrlParams: AuthorizationUrlRequest;

    constructor(clientId: string, cacheNamespace: string) {
        super();

        const cache = new CachePluginFactory(cacheNamespace);
        this.clientApplication = this.createClientApplication(clientId, cache);
        this.account = null;
        this.authCodeUrlParams = { scopes: [], redirectUri: `http://localhost:12345/redirect` };
    }

    private createClientApplication(clientId: string, cache: CachePluginFactory): PublicClientApplication {
        return new PublicClientApplication({
            auth: {
                clientId,
                //authority: `https://login.microsoftonline.com/${consumingTenantId}/`,
                authority: `https://login.microsoftonline.com/common/`,
            },
            cache: {
                cachePlugin: cache
            },
            system: {
                loggerOptions: this.createLoggerOptions(),
            }
        });
    }

    private createLoggerOptions() {
        return {
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
        };
    }
}