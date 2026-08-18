import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { buildCopilotArguments, buildCopilotEnvironment } from './copilot';
import { loadContract, requireSingleRole } from './contract';
import { findRepositoryRoot } from './git';

test('Copilot adapter applies bounded non-interactive permissions', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    const assignment = requireSingleRole(loaded.contract, 'implementer');
    const args = buildCopilotArguments({
        repoRoot,
        worktreePath: repoRoot,
        artifactDir: path.join(repoRoot, '.agent-runs', 'test'),
        runId: 'test-run',
        baseCommit: '0'.repeat(40),
        contract: loaded.contract,
        policy: loaded.policy,
        assignment,
        resultSchemaPath: path.join(repoRoot, '.agent', 'schemas', 'worker-result.schema.json'),
        validate: () => []
    }, 'test prompt');

    assert.equal(args.includes('--allow-all'), false);
    assert.equal(args.includes('--allow-all-tools'), false);
    assert.equal(args.includes('--allow-all-paths'), false);
    assert.equal(args.includes('--allow-all-urls'), false);
    assert.equal(args.includes('--yolo'), false);
    assert.ok(args.includes('--allow-tool=write'));
    assert.ok(args.includes('--deny-tool=url'));
    assert.ok(args.includes('--deny-tool=shell'));
    assert.equal(args.some(arg => arg.startsWith('--allow-tool=shell(')), false);
    assert.ok(args.includes('--disable-builtin-mcps'));
    assert.ok(args.includes('--no-ask-user'));
    assert.ok(args.includes('--experimental'));
    assert.ok(args.includes('--sandbox'));
    assert.ok(args.includes(String(loaded.contract.limits.maxAiCreditsPerWorker)));
    assert.ok(args.includes('github'));
    assert.ok(args.includes('github-mcp-server'));
    const agentIndex = args.indexOf('--agent');
    assert.notEqual(agentIndex, -1);
    assert.equal(args[agentIndex + 1], 'spe-implementer');
});

test('reviewer receives a read-only permission envelope', async () => {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    const assignment = requireSingleRole(loaded.contract, 'reviewer');
    const args = buildCopilotArguments({
        repoRoot,
        worktreePath: repoRoot,
        artifactDir: path.join(repoRoot, '.agent-runs', 'test-review'),
        runId: 'test-run',
        baseCommit: '0'.repeat(40),
        reviewedCommit: '1'.repeat(40),
        contract: loaded.contract,
        policy: loaded.policy,
        assignment,
        resultSchemaPath: path.join(repoRoot, '.agent', 'schemas', 'review-result.schema.json'),
        validate: () => []
    }, 'test prompt');

    assert.ok(args.includes('--deny-tool=write'));
    assert.equal(args.includes('--allow-tool=write'), false);
    const agentIndex = args.indexOf('--agent');
    assert.notEqual(agentIndex, -1);
    assert.equal(args[agentIndex + 1], 'spe-reviewer');
});

test('Windows worker environment excludes incompatible sandbox paths', () => {
    const environment = buildCopilotEnvironment({
        Path: [
            'C:\\Program Files\\nodejs',
            'C:\\ProgramData\\chocolatey\\bin\\',
            'C:\\Program Files\\Git\\cmd'
        ].join(';'),
        KEEP_ME: 'value'
    }, 'win32');

    assert.equal(
        environment.Path,
        'C:\\Program Files\\nodejs;C:\\Program Files\\Git\\cmd'
    );
    assert.equal(environment.KEEP_ME, 'value');
});
