import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { validateAgentProfile } from './agentProfiles';
import { loadContract } from './contract';
import { findRepositoryRoot } from './git';

test('custom agent profiles enforce role-specific tool boundaries', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );

    for (const worker of loaded.contract.workers) {
        const profile = validateAgentProfile(repoRoot, worker);
        assert.equal(profile.userInvocable, false);
        assert.equal(profile.disableModelInvocation, true);
        assert.equal(profile.tools.includes('web'), false);
        assert.equal(profile.tools.includes('agent'), false);
        assert.equal(profile.tools.includes('execute'), false);
        assert.equal(profile.tools.includes('*'), false);
        assert.equal(profile.tools.includes('edit'), worker.mayEdit);
    }
});

test('each worker uses a distinct custom agent identity', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    const agents = loaded.contract.workers.map(worker => worker.agent);

    assert.equal(new Set(agents).size, agents.length);
    assert.deepEqual(agents.sort(), [
        'spe-implementer',
        'spe-integrator',
        'spe-reviewer',
        'spe-sdet'
    ]);
});
