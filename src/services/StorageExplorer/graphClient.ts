/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import type * as vscode from 'vscode';
import { clientId } from '../../client';
import { AuthenticationState } from '../AuthenticationState';
import { VSCodeAuthProvider } from '../Auth';
import { NetworkLoggingMiddleware, NetworkLogger } from './NetworkLoggingMiddleware';

const STORAGE_EXPLORER_SCOPES = [
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/FileStorageContainer.Selected',
];

/**
 * Build the Graph client used to serve Storage Explorer webview requests.
 *
 * The delegated bearer token is acquired here, on the extension host, and attached
 * to outbound requests by the SDK's `AuthenticationHandler`. It never leaves this
 * process — in particular it is never sent to the webview.
 *
 * This factory is deliberately kept out of `StorageExplorerApi` so that the API
 * layer has no dependency on `vscode` and can be exercised with an injected client.
 */
export function createGraphClient(onNetworkRequest: NetworkLogger): Graph.Client {
    let authProvider: VSCodeAuthProvider | undefined;
    let authProviderKey: string | undefined;

    const authenticationProvider: Graph.AuthenticationProvider = {
        getAccessToken: async (): Promise<string> => {
            const currentAccount = AuthenticationState.getCurrentAccountSync();
            const tenantId = currentAccount?.tenantId;
            const providerKey = tenantId ?? 'organizations';

            if (!authProvider || authProviderKey !== providerKey) {
                authProvider = new VSCodeAuthProvider({
                    clientId,
                    scopes: STORAGE_EXPLORER_SCOPES,
                    tenantId,
                });
                authProviderKey = providerKey;
            }

            const account: vscode.AuthenticationSessionAccountInformation | undefined = currentAccount
                ? { id: currentAccount.id, label: currentAccount.username }
                : undefined;

            try {
                return await authProvider.getToken(undefined, false, account);
            } catch {
                // No cached session yet — fall back to an interactive acquisition.
                return await authProvider.getToken(undefined, true, account);
            }
        },
    };

    // NetworkLoggingMiddleware must be first so it wraps the whole chain and
    // measures the full round-trip. It strips `Authorization` before logging.
    return Graph.Client.initWithMiddleware({
        middleware: [
            new NetworkLoggingMiddleware(onNetworkRequest),
            ...Graph.MiddlewareFactory.getDefaultMiddlewareChain(authenticationProvider),
        ],
    });
}
