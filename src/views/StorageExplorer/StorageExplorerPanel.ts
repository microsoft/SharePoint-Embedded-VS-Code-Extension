/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerType, ContainerTypeRegistration } from '../../models/schemas';
import { ext } from '../../utils/extensionVariables';
import { GraphAuthProvider } from '../../services/Auth';
import { AuthenticationState } from '../../services/AuthenticationState';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}

interface PanelState {
    appName: string;
    tenantDomain: string;
    containerTypeId: string;
    registrationId: string;
    /** Pre-seeded access token so the webview auth provider avoids a cold first request. */
    initialToken?: string;
}

/**
 * Manages one Storage Explorer WebviewPanel per ContainerTypeRegistration.
 * Opening the same registration twice reveals the existing panel.
 */
export class StorageExplorerPanel {
    private static readonly _panels = new Map<string, StorageExplorerPanel>();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _registrationId: string;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        registrationId: string,
        state: PanelState
    ) {
        this._panel = panel;
        this._registrationId = registrationId;

        this._panel.webview.html = StorageExplorerPanel._buildHtml(this._panel.webview, state);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: { command: string; har?: string; url?: string; requestId?: string }) => {
                ext.outputChannel.debug(`[StorageExplorerPanel] received message: command=${message.command}`);
                if (message.command === 'exportHar' && message.har) {
                    await StorageExplorerPanel._handleExportHar(message.har);
                } else if (message.command === 'openExternal' && message.url) {
                    ext.outputChannel.info(`[StorageExplorerPanel] opening external URL: ${message.url}`);
                    try {
                        await vscode.env.openExternal(vscode.Uri.parse(message.url));
                        ext.outputChannel.info(`[StorageExplorerPanel] openExternal succeeded`);
                    } catch (err) {
                        ext.outputChannel.error(`[StorageExplorerPanel] openExternal failed: ${err}`);
                    }
                } else if (message.command === 'getToken' && message.requestId) {
                    try {
                        const token = await GraphAuthProvider.getInstance().getToken(undefined, false);
                        this._panel.webview.postMessage({ command: 'tokenResponse', token, requestId: message.requestId });
                    } catch (err) {
                        ext.outputChannel.error(`[StorageExplorerPanel] getToken failed: ${err}`);
                        this._panel.webview.postMessage({ command: 'tokenResponse', error: String(err), requestId: message.requestId });
                    }
                } else {
                    ext.outputChannel.warn(`[StorageExplorerPanel] unhandled message command: ${message.command}`);
                }
            },
            null,
            this._disposables
        );
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    public static async open(
        containerType: ContainerType,
        registration: ContainerTypeRegistration
    ): Promise<void> {
        const registrationId = registration.id;
        const existing = StorageExplorerPanel._panels.get(registrationId);
        if (existing) {
            existing._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'speStorageExplorer',
            `${containerType.name} – Storage Explorer`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(ext.context.extensionUri, 'out', 'webviewApp'),
                    vscode.Uri.joinPath(ext.context.extensionUri, 'media')
                ]
            }
        );
        panel.iconPath = vscode.Uri.joinPath(ext.context.extensionUri, 'media', 'sharepoint-embedded-icon.png');

        // Pre-fetch the token so the webview can seed its auth cache immediately,
        // eliminating the cold-start latency on the first Graph call.
        let initialToken: string | undefined;
        try {
            initialToken = GraphAuthProvider.getInstance().getCachedToken()
                ?? await GraphAuthProvider.getInstance().getToken(undefined, false);
        } catch {
            // No session yet — the webview will request a token via message when needed.
        }

        const state: PanelState = {
            appName: containerType.name,
            tenantDomain: AuthenticationState.getCurrentAccountSync()?.domain ?? 'local tenant',
            containerTypeId: containerType.id,
            registrationId: registration.id,
            initialToken,
        };

        const instance = new StorageExplorerPanel(panel, registrationId, state);
        StorageExplorerPanel._panels.set(registrationId, instance);
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private static async _handleExportHar(har: string): Promise<void> {
        const tmpDir = require('os').tmpdir();
        const path = require('path');
        const fs = require('fs');
        const fileName = `storage-explorer-${Date.now()}.har`;
        const filePath = path.join(tmpDir, fileName);
        fs.writeFileSync(filePath, har, 'utf8');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    private static _buildHtml(webview: vscode.Webview, state: PanelState): string {
        const base = ext.context.extensionUri;
        const asUri = (path: string[]) =>
            webview.asWebviewUri(vscode.Uri.joinPath(base, ...path)).toString();

        const scriptUri = asUri(['out', 'webviewApp', 'assets', 'index.js']);
        const styleUri  = asUri(['out', 'webviewApp', 'assets', 'style.css']);
        const nonce = getNonce();
        const csp = [
            `default-src 'none'`,
            `connect-src https://graph.microsoft.com https://*.sharepoint.com`,
            `font-src ${webview.cspSource}`,
            `img-src ${webview.cspSource} data:`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`,
        ].join('; ');

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Storage Explorer</title>
  <script nonce="${nonce}">
    window.__STORAGE_EXPLORER_STATE__ = ${JSON.stringify(state)};
  </script>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private dispose(): void {
        StorageExplorerPanel._panels.delete(this._registrationId);
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
        this._disposables.length = 0;
    }
}
