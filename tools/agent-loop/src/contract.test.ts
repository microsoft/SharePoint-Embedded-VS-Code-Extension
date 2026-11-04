import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import {
    loadContract,
    validateContractInvariants
} from './contract';
import { findRepositoryRoot } from './git';

test('example contract validates with required independent roles', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );

    assert.equal(loaded.contract.taskId, 'storage-explorer-bulk-restore');
    assert.equal(loaded.contract.workers.filter(worker => worker.role === 'reviewer').length, 1);
});

test('contract rejects commands outside the authority policy', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    const contract = structuredClone(loaded.contract);
    contract.requiredChecks.push({
        id: 'forbidden',
        command: 'git push origin main',
        timeoutMinutes: 1
    });

    assert.throws(
        () => validateContractInvariants(repoRoot, contract, loaded.policy),
        /not allowed by the authority policy/
    );
});

test('contract rejects overlapping parallel edit scopes', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    const contract = structuredClone(loaded.contract);
    const sdet = contract.workers.find(worker => worker.role === 'sdet');
    assert.ok(sdet);
    sdet.allowedPaths.push('src/services/StorageExplorer/**');

    assert.throws(
        () => validateContractInvariants(repoRoot, contract, loaded.policy),
        /path scopes overlap/
    );
});
