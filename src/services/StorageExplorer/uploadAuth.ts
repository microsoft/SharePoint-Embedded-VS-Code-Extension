/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { clientId } from '../../client';
import { VSCodeAuthProvider } from '../Auth';
import { AuthenticationState } from '../AuthenticationState';
import type { UploadSessionOptions } from './UploadSessionService';
import { createGraphClient } from './graphClient';
import { createTemporaryGraphUpload } from './temporaryGraphUpload';

function authenticationFailure(error: unknown): Error {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const code = error !== null && typeof error === 'object'
        ? 'errorCode' in error && typeof error.errorCode === 'string' ? error.errorCode
            : 'code' in error && typeof error.code === 'string' ? error.code : ''
        : '';
    // Provider errors can contain tokens and sign-in URLs; expose only known error identifiers.
    if (/\bplatform_broker_error\b/i.test(`${code} ${message}`)) {
        return new Error(vscode.l10n.t(
            'SharePoint sign-in failed in the native Microsoft authentication broker (platform_broker_error). If your organization permits browser-based sign-in, set "microsoft-authentication.implementation" to "msal-no-broker" in VS Code User Settings, restart VS Code, and retry. This changes Microsoft authentication for VS Code, not just uploads.'
        ));
    }
    const aadsts = /\bAADSTS\d{5,9}\b/i.exec(`${code} ${message}`)?.[0].toUpperCase();
    const identifiers = [
        'consent_required', 'interaction_required', 'invalid_scope', 'invalid_resource',
        'unauthorized_client', 'invalid_client', 'access_denied', 'user_cancelled',
        'user_canceled', 'user_timeout', 'temporarily_unavailable', 'server_error', 'network_error',
    ];
    const identifier = aadsts ?? identifiers.find(value =>
        code.toLowerCase() === value || new RegExp(`\\b${value}\\b`, 'i').test(message)
    );
    if (identifier) {
        return new Error(vscode.l10n.t(
            'SharePoint token acquisition failed ({0}). Check Microsoft Authentication in the Output panel for details. SharePoint Online permissions or tenant consent may require an administrator.',
            identifier
        ));
    }
    if (/user did not consent|cancelled|canceled/i.test(message)) {
        return new Error(vscode.l10n.t(
            'VS Code reported that SharePoint sign-in or consent was cancelled or declined. No upload chunk was sent. Check Microsoft Authentication in the Output panel for details.'
        ));
    }
    return new Error(vscode.l10n.t(
        'VS Code could not return a SharePoint token after sign-in and supplied no recognized error code. No upload chunk was sent. Check Microsoft Authentication in the Output panel for details; missing consent has not been confirmed.'
    ));
}

/** SharePoint-audience tokens are acquired only on the host, never from the webview. */
export function createUploadSessionOptions(
    onNetworkRequest: UploadSessionOptions['onNetworkRequest']
): UploadSessionOptions {
    const providers = new Map<string, VSCodeAuthProvider>();
    const graphClient = createGraphClient(onNetworkRequest ?? (() => { /* no network listener */ }), false);
    return {
        onNetworkRequest,
        createStagingFile: () => createTemporaryGraphUpload(graphClient),
        getIdentity: () => {
            const account = AuthenticationState.getCurrentAccountSync();
            return account ? `${account.tenantId}:${account.id}` : '';
        },
        acquireToken: async origin => {
            const account = AuthenticationState.getCurrentAccountSync();
            if (!account?.tenantId) {
                throw new Error(vscode.l10n.t('Sign into your Microsoft 365 tenant before uploading.'));
            }
            const key = `${account.tenantId}:${account.id}:${origin}`;
            let provider = providers.get(key);
            if (!provider) {
                provider = new VSCodeAuthProvider({
                    clientId,
                    tenantId: account.tenantId,
                    scopes: [`${origin}/.default`],
                });
                providers.set(key, provider);
            }
            const hint = { id: account.id, label: account.username };
            try {
                return await provider.getToken(undefined, false, hint);
            } catch {
                try {
                    return await provider.getToken(undefined, true, hint);
                } catch (error) {
                    throw authenticationFailure(error);
                }
            }
        },
    };
}
