import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { loadContract } from './contract';
import { findRepositoryRoot } from './git';
import { runSdkPreflight } from './sdkPreflight';

test(
    'real Copilot SDK runtime passes preflight',
    { skip: process.env.AGENT_LOOP_RUN_SDK_SMOKE !== '1' },
    async () => {
        const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
        const loaded = loadContract(
            repoRoot,
            path.join(
                repoRoot,
                '.agent',
                'contracts',
                'examples',
                'storage-explorer-bulk-restore.json'
            )
        );
        const result = await runSdkPreflight({
            repoRoot,
            contract: loaded.contract,
            workers: loaded.contract.workers,
            environment: {
                ...process.env,
                AGENT_LOOP_MODEL: process.env.AGENT_LOOP_MODEL ?? 'claude-sonnet-5',
                AGENT_LOOP_REASONING_EFFORT:
                    process.env.AGENT_LOOP_REASONING_EFFORT ?? 'high'
            }
        });

        assert.equal(path.isAbsolute(result.cliPath), true);
        assert.ok(result.sdkVersion.length > 0);
        assert.ok(result.cliVersion.length > 0);
        assert.ok(result.availableTools.includes('view'));
        assert.ok(result.availableTools.includes('create'));
    }
);
