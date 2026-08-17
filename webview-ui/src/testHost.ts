/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEV-ONLY extension-host emulator for the standalone webview harness.
 *
 * In production the webview holds no credentials: it posts `rpc/request` messages and the
 * VS Code extension host executes them against Microsoft Graph. When the app is served
 * standalone by `vite dev` (the Playwright UI suite in `ui-tests/`), there is no extension
 * host, so this module stands one up **inside the page** using the *same* host-side
 * `StorageExplorerApi`. Graph traffic then goes over the wire as normal and can be
 * intercepted by Playwright's route mock.
 *
 * This module is loaded through a dynamic `import()` guarded by `import.meta.env.DEV`, so
 * it — and the Graph SDK it pulls in — is dead-code-eliminated from the production bundle.
 * It must never be imported from application code.
 */

import * as Graph from '@microsoft/microsoft-graph-client';
import { NetworkLoggingMiddleware } from '../../src/services/StorageExplorer/NetworkLoggingMiddleware';
import { serializeError, StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import { diagnoseAccessDenied } from '../../src/services/StorageExplorer/accessDenied';
import { clientId } from '../../src/client';
import { REQUIRED_DELEGATED_PERMISSIONS } from '../../src/utils/ExtensionAppPermissionScopes';

export interface TestHostOptions {
    /** Container type the emulated panel is bound to (injected into scoped operations). */
    containerTypeId: string;
    /** Bearer token used for outbound Graph calls. Test-only. */
    token: string;
}

interface PostedMessage {
    command?: string;
    requestId?: string;
    op?: unknown;
    params?: unknown;
    [key: string]: unknown;
}

declare global {
    interface Window {
        /** Every message the app posted "to the host". Lets specs assert on openExternal/exportHar. */
        __SPE_TEST_POSTED__?: PostedMessage[];
    }
}

/**
 * Install a `window.acquireVsCodeApi` shim that answers `rpc/request` messages by running
 * the real host API. Must be called before the React app mounts.
 */
export function installTestHost(options: TestHostOptions): void {
    const posted: PostedMessage[] = [];
    window.__SPE_TEST_POSTED__ = posted;

    const toWebview = (data: unknown): void => {
        window.dispatchEvent(new MessageEvent('message', { data }));
    };

    const client = Graph.Client.initWithMiddleware({
        middleware: [
            new NetworkLoggingMiddleware(request => toWebview({ command: 'networkLog', request })),
            ...Graph.MiddlewareFactory.getDefaultMiddlewareChain({
                getAccessToken: async () => options.token,
            }),
        ],
    });

    const api = new StorageExplorerApi(options.containerTypeId, client);

    /**
     * Mirror of `hasExtensionAppPermissions()` from the extension host, which cannot be
     * imported here because it pulls in `vscode`. Kept faithful so the harness reproduces
     * the host's access-denied diagnosis rather than a more forgiving version of it.
     */
    const hasExtensionPermissions = async (): Promise<boolean> => {
        // Mirrors `ContainerTypeAppPermissionGrantService.get()`: a 404 means "no grant"
        // (a definitive negative), while any other failure propagates so the diagnosis is
        // skipped rather than reported as a permissions problem.
        let grant: { delegatedPermissions?: string[] } | null;
        try {
            grant = await client
                .api(`/storage/fileStorage/containerTypeRegistrations/${options.containerTypeId}/applicationPermissionGrants/${clientId}`)
                .get() as { delegatedPermissions?: string[] } | null;
        } catch (error) {
            if ((error as { statusCode?: number })?.statusCode !== 404) { throw error; }
            grant = null;
        }
        const granted = new Set(grant?.delegatedPermissions ?? []);
        return REQUIRED_DELEGATED_PERMISSIONS.every(p => granted.has(p));
    };

    /**
     * Mirror of the host's `grantPermissions` handler. The real host confirms with the user
     * first; there is nobody to ask here, so the harness goes straight to the grant — the
     * point of the emulation is the message round-trip and the resulting reload, not the
     * dialog. Always answers, including on failure, exactly as the host does.
     */
    const grantPermissions = async (): Promise<void> => {
        try {
            await client
                .api(`/storage/fileStorage/containerTypeRegistrations/${options.containerTypeId}/applicationPermissionGrants/${clientId}`)
                .put({
                    appId: clientId,
                    delegatedPermissions: REQUIRED_DELEGATED_PERMISSIONS,
                    applicationPermissions: [],
                });
            toWebview({ command: 'permissionsGrantResult', granted: true });
        } catch {
            toWebview({ command: 'permissionsGrantResult', granted: false });
        }
    };

    const handle = async (message: PostedMessage): Promise<void> => {
        const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
        if (!requestId) return;
        try {
            const result = await api.execute(message.op, message.params, {
                onProgress: data => toWebview({ command: 'rpc/progress', requestId, data }),
            });
            toWebview({ command: 'rpc/response', requestId, ok: true, result });
        } catch (error) {
            const { error: diagnosed } = await diagnoseAccessDenied(
                serializeError(error),
                hasExtensionPermissions,
            );
            toWebview({ command: 'rpc/response', requestId, ok: false, error: diagnosed });
        }
    };

    (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => ({
        postMessage: (message: PostedMessage) => {
            posted.push(message);
            if (message?.command === 'rpc/request') {
                void handle(message);
            } else if (message?.command === 'grantPermissions') {
                void grantPermissions();
            }
        },
    });
}
