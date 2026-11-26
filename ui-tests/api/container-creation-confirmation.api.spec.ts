/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client } from '@microsoft/microsoft-graph-client';
import { test, expect } from '@playwright/test';
import { createSandbox } from 'sinon';
import type { ContainerType } from '../../src/models/schemas';
import { ContainerGraphService } from '../../src/services/StorageExplorer/ContainerGraphService';
import { containerToStorageItem } from '../../src/services/StorageExplorer/mappers';
import type { RpcRequestMessage, StorageItem } from '../../src/services/StorageExplorer/protocol';
import { mockModuleFor } from '../helpers/mock/moduleStub';
import { installVscodeStub } from '../helpers/mock/vscodeStub';

const panelModule = 'views/StorageExplorer/StorageExplorerPanel.ts';
const vscode = installVscodeStub();
const notifications: string[] = [];
const replies: unknown[] = [];
let onRequest: ((message: RpcRequestMessage) => Promise<void>) | undefined;

mockModuleFor(panelModule, 'vscode', {
    l10n: vscode.l10n,
    ViewColumn: { One: 1 },
    Uri: { joinPath: (...segments: string[]) => segments.join('/') },
    Disposable: class {
        constructor(private readonly disposeCallback: () => void) { }
        dispose() { this.disposeCallback(); }
    },
    window: {
        createWebviewPanel: () => ({
            webview: {
                cspSource: 'https://fixture.invalid',
                asWebviewUri: (uri: string) => uri,
                onDidReceiveMessage: (listener: typeof onRequest) => { onRequest = listener; },
                postMessage: async (message: unknown) => { replies.push(message); return true; },
            },
            onDidDispose: () => undefined,
            dispose: () => undefined,
        }),
        showInformationMessage: async (message: string) => { notifications.push(message); },
    },
});
mockModuleFor(panelModule, 'utils/extensionVariables', {
    ext: {
        context: { extensionUri: '/extension' },
        outputChannel: { debug: () => undefined, info: () => undefined, error: () => undefined },
    },
});
mockModuleFor(panelModule, 'services/AuthenticationState', {
    AuthenticationState: {
        getCurrentAccountSync: () => undefined,
        subscribe: () => undefined,
        unsubscribe: () => undefined,
    },
});
mockModuleFor(panelModule, 'services/StorageExplorer/graphClient', {
    createGraphClient: () => Client.initWithMiddleware({
        middleware: { execute: async () => { throw new Error('Unexpected Graph request in offline fixture.'); } },
    }),
});
mockModuleFor(panelModule, 'services/StorageExplorer/uploadAuth', { createUploadSessionOptions: () => undefined });
mockModuleFor(panelModule, 'utils/ExtensionAppPermissions', { readGrantedExtensionAppScopes: async () => ['full'] });
mockModuleFor(panelModule, 'treeview/development/DevelopmentTreeViewProvider', {});

const { StorageExplorerPanel }: typeof import('../../src/views/StorageExplorer/StorageExplorerPanel') =
    require('../../src/views/StorageExplorer/StorageExplorerPanel');

const containerType: ContainerType = {
    id: 'fixture-container-type',
    name: 'Storage Explorer test',
    owningAppId: '00000000-0000-4000-8000-000000000002',
    billingClassification: 'trial',
    billingStatus: 'valid',
};
const container = containerToStorageItem({
    id: 'fixture-container',
    containerTypeId: containerType.id,
    displayName: 'Project files',
});
const sandbox = createSandbox();

test.beforeEach(async () => {
    notifications.length = 0;
    replies.length = 0;
    onRequest = undefined;
    await StorageExplorerPanel.open(containerType, null);
});

test.afterEach(() => {
    StorageExplorerPanel.closeForContainerType(containerType.id);
    sandbox.restore();
});

for (const outcome of ['success', 'failure'] as const) {
    test(`container creation notification: ${outcome}`, async () => {
        let settleCreation: (() => void) | undefined;
        const create = sandbox.stub(ContainerGraphService.prototype, 'create').callsFake(
            () => new Promise<StorageItem>((resolve, reject) => {
                settleCreation = () => {
                    if (outcome === 'success') { resolve(container); }
                    else { reject(new Error('Fixture create failed')); }
                };
            })
        );
        if (!onRequest) { throw new Error('The Storage Explorer panel did not register a request handler.'); }
        const requestId = 'create-container';
        const response = onRequest({
            command: 'rpc/request', requestId, op: 'containers.create', params: { displayName: container.name },
        });

        try {
            await expect.poll(() => create.callCount).toBe(1);
            expect(notifications).toEqual([]);
            expect(replies).toEqual([]);
        } finally {
            settleCreation?.();
            await response;
        }

        if (outcome === 'success') {
            expect(replies).toEqual([{ command: 'rpc/response', requestId, ok: true, result: container }]);
            expect(notifications).toEqual(['Container created successfully.']);
        } else {
            expect(replies).toEqual([expect.objectContaining({
                command: 'rpc/response', requestId, ok: false, error: expect.objectContaining({ message: 'Fixture create failed' }),
            })]);
            expect(notifications).toEqual([]);
        }
    });
}
