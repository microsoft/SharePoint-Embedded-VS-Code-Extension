import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { loadContract } from './contract';
import { findRepositoryRoot } from './git';
import {
    resolveModel,
    resolveReasoningEffort,
    runSdkPreflight,
    type SdkClientFactory,
    type SdkClientLike,
    type SdkModelInfo
} from './sdkPreflight';

const MODELS: SdkModelInfo[] = [
    {
        id: 'auto'
    },
    {
        id: 'model-a',
        policy: { state: 'enabled' },
        supportedReasoningEfforts: ['low', 'high']
    },
    {
        id: 'disabled-model',
        policy: { state: 'disabled' }
    }
];

test('SDK preflight validates authentication, model, reasoning, tools, and runtime metadata', async () => {
    const { repoRoot, contract, workers } = await loadExample();
    const client = createPreflightClient();
    const result = await runSdkPreflight({
        repoRoot,
        contract,
        workers,
        environment: {
            AGENT_LOOP_COPILOT_COMMAND: process.execPath,
            AGENT_LOOP_MODEL: 'model-a',
            AGENT_LOOP_REASONING_EFFORT: 'high'
        },
        clientFactory: () => client
    });

    assert.equal(result.sdkVersion, '1.0.10-preview.0');
    assert.equal(result.cliPath, process.execPath);
    assert.equal(result.cliVersion, 'mock-cli');
    assert.equal(result.model, 'model-a');
    assert.equal(result.reasoningEffort, 'high');
    assert.equal(client.started, true);
    assert.equal(client.stopped, true);
});

test('SDK preflight fails closed for authentication and missing tools', async () => {
    const { repoRoot, contract, workers } = await loadExample();
    const unauthenticated = createPreflightClient({
        authenticated: false
    });
    await assert.rejects(
        runSdkPreflight({
            repoRoot,
            contract,
            workers,
            environment: { AGENT_LOOP_COPILOT_COMMAND: process.execPath },
            clientFactory: () => unauthenticated
        }),
        /authentication is unavailable/
    );
    assert.equal(unauthenticated.stopped, true);

    const missingTools = createPreflightClient({
        tools: ['view', 'grep']
    });
    await assert.rejects(
        runSdkPreflight({
            repoRoot,
            contract,
            workers,
            environment: { AGENT_LOOP_COPILOT_COMMAND: process.execPath },
            clientFactory: () => missingTools
        }),
        /missing required built-in tools: glob, create, edit/
    );

    const cleanupFailure = createPreflightClient({
        stopFailures: [new Error('runtime process remained alive')]
    });
    await assert.rejects(
        runSdkPreflight({
            repoRoot,
            contract,
            workers,
            environment: { AGENT_LOOP_COPILOT_COMMAND: process.execPath },
            clientFactory: () => cleanupFailure
        }),
        /runtime process remained alive/
    );
});

test('SDK model and reasoning configuration are strict', () => {
    assert.equal(resolveModel(undefined, MODELS), 'auto');
    assert.equal(resolveModel('model-a', MODELS), 'model-a');
    assert.throws(() => resolveModel('missing', MODELS), /not available/);
    assert.throws(() => resolveModel('disabled-model', MODELS), /disabled by policy/);
    assert.equal(resolveReasoningEffort(undefined, 'auto', MODELS), undefined);
    assert.throws(
        () => resolveReasoningEffort('high', 'auto', MODELS),
        /does not support an explicit/
    );
    assert.equal(resolveReasoningEffort('low', 'model-a', MODELS), 'low');
    assert.throws(
        () => resolveReasoningEffort('max', 'model-a', MODELS),
        /does not support/
    );
    assert.throws(
        () => resolveReasoningEffort('extreme', 'model-a', MODELS),
        /Unsupported AGENT_LOOP_REASONING_EFFORT/
    );
});

interface PreflightOverrides {
    authenticated?: boolean;
    tools?: string[];
    stopFailures?: Error[];
}

function createPreflightClient(overrides: PreflightOverrides = {}) {
    const client: SdkClientLike & { started: boolean; stopped: boolean } = {
        started: false,
        stopped: false,
        rpc: {
            tools: {
                list: async () => ({
                    tools: (
                        overrides.tools ??
                        ['view', 'grep', 'glob', 'create', 'edit']
                    ).map(name => ({ name }))
                })
            }
        },
        async start() {
            client.started = true;
        },
        async stop() {
            client.stopped = true;
            return overrides.stopFailures ?? [];
        },
        async getAuthStatus() {
            return {
                isAuthenticated: overrides.authenticated ?? true,
                statusMessage: 'mock'
            };
        },
        async getStatus() {
            return { version: 'mock-cli' };
        },
        async listModels() {
            return MODELS;
        },
        async createSession() {
            throw new Error('Preflight must not create a session');
        }
    };
    return client;
}

async function loadExample() {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    return {
        repoRoot,
        contract: loaded.contract,
        workers: loaded.contract.workers
    };
}
