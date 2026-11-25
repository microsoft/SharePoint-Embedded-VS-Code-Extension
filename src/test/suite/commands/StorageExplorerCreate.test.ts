import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { createSandbox } from 'sinon';
import * as vscode from 'vscode';
import { ContainerGraphService } from '../../../services/StorageExplorer/ContainerGraphService';
import type { StorageItem } from '../../../services/StorageExplorer/protocol';
import { StorageExplorerPanel } from '../../../views/StorageExplorer/StorageExplorerPanel';
import { containerType, createdContainer, openStorageExplorer, requestContainerCreation } from '../common/storageExplorerFixture';

suite('Storage Explorer create confirmation', () => {
    for (const succeeds of [true, false]) {
        test(succeeds ? 'notifies only after success' : 'does not notify after failure', async () => {
            const sandbox = createSandbox();
            const notify = sandbox.stub(vscode.window, 'showInformationMessage').resolves();
            let startCreation!: () => void;
            const started = new Promise<void>(resolve => { startCreation = resolve; });
            let completeCreation!: () => void;
            const creation = new Promise<StorageItem>((resolve, reject) => {
                completeCreation = () => {
                    if (succeeds) { resolve(createdContainer); }
                    else { reject(new Error('Synthetic creation failure')); }
                };
            });
            sandbox.stub(ContainerGraphService.prototype, 'create').callsFake(() => {
                startCreation();
                return creation;
            });

            try {
                const panel = await openStorageExplorer(sandbox);
                const request = requestContainerCreation(panel);
                await Promise.race([
                    started,
                    request.then(() => assert.fail('Creation RPC completed before reaching the service')),
                ]);
                try {
                    assert.equal(notify.callCount, 0, 'No notification while creation is pending');
                } finally {
                    completeCreation();
                    await request;
                }
                assert.equal(notify.callCount, succeeds ? 1 : 0);
            } finally {
                StorageExplorerPanel.closeForContainerType(containerType.id);
                sandbox.restore();
            }
        });
    }
});
