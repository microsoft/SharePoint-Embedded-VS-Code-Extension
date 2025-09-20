/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
import { htmlString } from '../views/html/page';

/**
 * Utility class for handling admin consent flows
 */
export class AdminConsentHelper {
    /**
     * Listen for admin consent response from Azure AD
     */
    public static async listenForAdminConsent(clientId: string, tenantId: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                type ConsentResponseQuery = {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    admin_consent?: string;
                    tenant?: string;
                    error?: string;
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    error_description?: string;
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    error_uri?: string;
                };
                
                const responseParams = url.parse(req.url || '', true).query as ConsentResponseQuery;
                const adminConsent: boolean = responseParams.admin_consent === 'True' ? true : false;
                const authError = responseParams.error;
                const authErrorDescription = responseParams.error_description;

                if (!authError && !authErrorDescription) {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(htmlString);
                    
                    resolve(adminConsent);

                    server.close(() => {
                        resolve(adminConsent);
                    });
                }
            });

            // Timeout of 3 minutes (3 * 60 * 1000 = 180000 milliseconds)
            const timeout = setTimeout(() => {
                server.close(() => {
                    reject(new Error('Consent response not received within the allowed timeout.'));
                });
            }, 3 * 60 * 1000);

            server.listen(0, async () => {
                const port = (<any>server.address()).port;
                const redirectUri = `http://localhost:${port}/redirect`;
                const adminConsentUrl = `https://login.microsoftonline.com/${tenantId}/adminconsent?client_id=${clientId}&redirect_uri=${redirectUri}`;
                await vscode.env.openExternal(vscode.Uri.parse(adminConsentUrl));
            });

            // Clear the timeout if an authorization code is received
            server.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }
}