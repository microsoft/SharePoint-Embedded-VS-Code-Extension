/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// @ts-ignore
import { AccountInfo, AuthorizationUrlRequest, ConfidentialClientApplication, LogLevel } from '@azure/msal-node';
import { CachePluginFactory } from '../utils/CacheFactory';
import { ext } from '../utils/extensionVariables';
import { BaseAuthProvider } from './BaseAuthProvider';
import { Account } from '../models/Account';

export default class ThirdPartyAuthProvider extends BaseAuthProvider {
    protected clientApplication: ConfidentialClientApplication;
    protected account: AccountInfo | null;
    protected authCodeUrlParams: AuthorizationUrlRequest;
    protected readonly interactiveTokenPrompt: string = vscode.l10n.t("Grant consent to your new Azure AD application? This step is required in order to create a Free Trial Container Type. This will open a new web browser where you can grant consent with the administrator account on your tenant");

    constructor(clientId: string, thumbprint: string, privateKey: string) {
        super();
        const cache = new CachePluginFactory(clientId);
        this.clientApplication = new ConfidentialClientApplication({
            auth: {
                clientId: clientId,
                authority: Account.get()?.tenantId ? `https://login.microsoftonline.com/${Account.get()!.tenantId}/` : `https://login.microsoftonline.com/common/`,
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
}