/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore
import { AccountInfo, AuthorizationUrlRequest, ConfidentialClientApplication, LogLevel } from '@azure/msal-node';
import { CachePluginFactory } from '../utils/CacheFactory';
import { ext } from '../utils/extensionVariables';
import { BaseAuthProvider } from './BaseAuthProvider';
import { Account } from '../models/Account';
import { checkJwtForAppOnlyRole, decodeJwt } from '../utils/token';


export type IAppOnlySecretCredential = { clientSecret: string; }
export type IAppOnlyCertCredential = {
    clientCertificate: { privateKey: string, thumbprint: string, x5c?: string };
};
export type IAppOnlyCredential = IAppOnlySecretCredential | IAppOnlyCertCredential;

export default class AppOnly3PAuthProvider extends BaseAuthProvider {
    protected clientApplication: ConfidentialClientApplication;
    protected account: AccountInfo | null;
    protected authCodeUrlParams: AuthorizationUrlRequest;

    constructor(clientId: string, tenantId: string, credential: IAppOnlyCredential) {
        super();
        this.clientApplication = new ConfidentialClientApplication({
            auth: {
                clientId: clientId,
                authority: `https://login.microsoftonline.com/${tenantId}/`,
                ...credential
            },
            system: {
                loggerOptions: {
                    logLevel: LogLevel.Verbose,
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
        this.authCodeUrlParams = { scopes: [], redirectUri: 'http://localhost:12345/redirect' };
    }

    public async getToken(scopes: string[]): Promise<string> {
        const authResponse = await this.clientApplication.acquireTokenByClientCredential({ scopes });
        return authResponse.accessToken || "";
    }

    public async hasConsent(audience: string, roles: string[]): Promise<boolean> {
        try {
            const scopes = [`${audience}`];
            console.log('Checking for consent with scopes: ', scopes);
            const token = await this.getToken(scopes);
            const decodedToken = decodeJwt(token);
            console.log('Decoded token: ', decodedToken);
            for (const role of roles) {
                if (!checkJwtForAppOnlyRole(decodedToken, role)) {
                    return false;
                }
            }
            return true;
        } catch (error: any) {
            console.log(error);
            return false;
        }
    }
}