/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationState } from './AuthenticationState';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

/**
 * Handles deep-link URIs of the form:
 * vscode://sharepointembedded.ms-sharepoint-embedded-vscode-extension/{tenant-id}/{container-type-id}?action=open
 */
export class SpeUriHandler implements vscode.UriHandler {

    async handleUri(uri: vscode.Uri): Promise<void> {
        console.log('[SpeUriHandler] Handling URI:', uri.toString());

        // Parse path segments: /{tenant-id}/{container-type-id}
        const pathSegments = uri.path.split('/').filter(s => s.length > 0);

        // No path segments means this is a bare "return focus to VS Code" redirect
        // (e.g., after admin consent). Just bring VS Code to the foreground.
        if (pathSegments.length === 0) {
            return;
        }

        if (pathSegments.length < 2) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Invalid SharePoint Embedded link format.')
            );
            return;
        }

        const tenantId = pathSegments[0];
        const containerTypeId = pathSegments[1];

        const params = new URLSearchParams(uri.query);
        const action = params.get('action');

        if (action === 'open') {
            await this._handleOpenAction(tenantId, containerTypeId);
        } else {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Unknown action: {0}', action ?? '')
            );
        }
    }

    private async _handleOpenAction(tenantId: string, containerTypeId: string): Promise<void> {
        try {
            const isSignedIn = await AuthenticationState.isSignedIn();
            const currentAccount = AuthenticationState.getCurrentAccountSync();

            if (!isSignedIn || !currentAccount) {
                // Not signed in (or account state lost after sign-out) —
                // trigger full sign-in flow to restore context keys and state.
                await AuthenticationState.signInToTenant(tenantId);
            } else if (currentAccount.tenantId !== tenantId) {
                // Signed into wrong tenant — prompt to switch
                const switchLabel = vscode.l10n.t('Switch');
                const choice = await vscode.window.showInformationMessage(
                    vscode.l10n.t('This link targets a different tenant. Switch accounts to continue?'),
                    switchLabel,
                    vscode.l10n.t('Cancel')
                );
                if (choice !== switchLabel) {
                    return;
                }
                await AuthenticationState.signOut();
                await AuthenticationState.signInToTenant(tenantId);
            }
            // else: already signed into correct tenant — proceed

            // Refresh the tree and reveal the container type.
            // revealContainerType() awaits the internal _childrenLoaded gate
            // so it uses the same objects VS Code received from getChildren().
            const devTree = DevelopmentTreeViewProvider.getInstance();
            devTree.refresh();

            const found = await devTree.revealContainerType(containerTypeId);
            if (!found) {
                vscode.window.showWarningMessage(
                    vscode.l10n.t('Container type not found or you do not have access.')
                );
            }
        } catch (error: any) {
            console.error('[SpeUriHandler] Error handling open action:', error);
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to open shared link: {0}', error.message || error)
            );
        }
    }
}
