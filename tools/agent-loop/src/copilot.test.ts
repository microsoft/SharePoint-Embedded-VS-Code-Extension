import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
    buildSdkSessionConfig,
    createSdkPermissionHandler,
    invokeSdkWorker,
    parseSdkStructuredResult,
    type InvocationOptions
} from './copilot';
import { loadContract, requireSingleRole } from './contract';
import { findRepositoryRoot } from './git';
import {
    buildSdkEnvironment,
    type SdkAssistantMessage,
    type SdkClientFactory,
    type SdkClientLike,
    type SdkSessionEvent,
    type SdkSessionLike
} from './sdkPreflight';
import { WorkerResult } from './types';

interface MockSessionConfig {
    availableTools?: string[];
    agent?: string;
    enableSessionStore?: boolean;
    memory?: { enabled?: boolean };
    mcpServers?: Record<string, unknown>;
    requestExtensions?: boolean;
    manageScheduleEnabled?: boolean;
    enableSessionTelemetry?: boolean;
    enableFileHooks?: boolean;
    enableHostGitOperations?: boolean;
    enableSkills?: boolean;
    remoteSession?: string;
    skipEmbeddingRetrieval?: boolean;
    embeddingCacheStorage?: string;
    onEvent?: (event: SdkSessionEvent) => void;
    onPermissionRequest?: (
        request: { kind: string },
        invocation: { sessionId: string }
    ) => Promise<{ kind: string; feedback?: string }> | { kind: string; feedback?: string };
}

class MockSession implements SdkSessionLike {
    public readonly sessionId = 'mock-session';
    public aborted = false;
    public disconnected = false;

    public constructor(
        private readonly _config: MockSessionConfig,
        private readonly _send: (config: MockSessionConfig) => Promise<SdkAssistantMessage | undefined>
    ) {}

    public sendAndWait(): Promise<SdkAssistantMessage | undefined> {
        return this._send(this._config);
    }

    public async abort(): Promise<void> {
        this.aborted = true;
    }

    public async disconnect(): Promise<void> {
        this.disconnected = true;
    }
}

class MockClient implements SdkClientLike {
    public started = false;
    public stopped = false;
    public session?: MockSession;
    public readonly rpc = {
        tools: {
            list: async () => ({ tools: [] as Array<{ name: string }> })
        }
    };

    public constructor(
        private readonly _send: (config: MockSessionConfig) => Promise<SdkAssistantMessage | undefined>,
        public readonly stopFailures: Error[] = []
    ) {}

    public async start(): Promise<void> {
        this.started = true;
    }

    public async stop(): Promise<Error[]> {
        this.stopped = true;
        return this.stopFailures;
    }

    public async getAuthStatus() {
        return { isAuthenticated: true };
    }

    public async getStatus() {
        return { version: 'mock-cli' };
    }

    public async listModels() {
        return [{ id: 'auto' }];
    }

    public async createSession(config: unknown): Promise<SdkSessionLike> {
        this.session = new MockSession(config as MockSessionConfig, this._send);
        return this.session;
    }
}

test('SDK session exposes only canonical role tools and disables optional surfaces', async () => {
    const options = await buildInvocationOptions('implementer');
    const config = buildSdkSessionConfig(options, 'agent instructions');

    assert.deepEqual(config.availableTools, ['view', 'grep', 'glob', 'create', 'edit']);
    assert.equal(config.agent, 'spe-implementer');
    assert.equal(config.enableSessionStore, false);
    assert.deepEqual(config.memory, { enabled: false });
    assert.deepEqual(config.mcpServers, {});
    assert.equal(config.requestExtensions, false);
    assert.equal(config.manageScheduleEnabled, false);
    assert.equal(config.enableSessionTelemetry, false);
    assert.equal(config.enableFileHooks, false);
    assert.equal(config.enableHostGitOperations, false);
    assert.equal(config.enableSkills, false);
    assert.equal(config.remoteSession, 'off');
    assert.equal(config.skipEmbeddingRetrieval, true);
    assert.equal(config.embeddingCacheStorage, 'in-memory');
    assert.deepEqual(config.managedSettings, {
        permissions: { disableBypassPermissionsMode: 'disable' }
    });
});

test('SDK permission handler enforces read, write, and default-deny authority', async () => {
    const options = await buildInvocationOptions('implementer');
    const decide = createSdkPermissionHandler(options);
    const invocation = { sessionId: 'test' };

    assert.deepEqual(
        await decide({ kind: 'read', path: 'webview-ui/src/App.tsx' }, invocation),
        { kind: 'approve-once' }
    );
    assert.deepEqual(
        await decide({ kind: 'write', fileName: 'webview-ui/src/context/example.ts' }, invocation),
        { kind: 'approve-once' }
    );
    assert.equal(
        (await decide({
            kind: 'read',
            path: 'webview-ui/src/App.tsx',
            requestSandboxBypass: true
        }, invocation)).kind,
        'reject'
    );
    assert.equal(
        (await decide({ kind: 'write', fileName: 'src/extension.ts' }, invocation)).kind,
        'reject'
    );
    assert.equal(
        (await decide({ kind: 'shell' }, invocation)).kind,
        'reject'
    );
    assert.equal(
        (await decide({ kind: 'url' }, invocation)).kind,
        'reject'
    );
});

test('SDK structured results accept only a schema-valid JSON object', () => {
    const validate = (value: unknown) => (
        value && typeof value === 'object' && 'status' in value
            ? []
            : ['Missing status']
    );

    assert.deepEqual(
        parseSdkStructuredResult('{"status":"completed"}', validate),
        { status: 'completed' }
    );
    assert.throws(
        () => parseSdkStructuredResult('```json\n{"status":"completed"}\n```', validate),
        /malformed JSON/
    );
    assert.throws(
        () => parseSdkStructuredResult('{"summary":"missing"}', validate),
        /Missing status/
    );
});

test('SDK worker captures lifecycle events and runtime metadata incrementally', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spe-sdk-test-'));
    const options = await buildInvocationOptions('reviewer', temporaryRoot);
    const client = new MockClient(async config => {
        config.onEvent?.({ type: 'session.start', data: {} });
        config.onEvent?.({
            type: 'assistant.message',
            data: { content: validReviewerJson() }
        });
        config.onEvent?.({ type: 'session.idle', data: {} });
        return {
            type: 'assistant.message',
            data: { content: validReviewerJson() }
        };
    });

    try {
        const result = await invokeSdkWorker(options, factoryFor(client));
        assert.equal((result as { decision: string }).decision, 'blocked');
        assert.equal(client.started, true);
        assert.equal(client.stopped, true);
        assert.equal(client.session?.disconnected, true);

        const events = await readFile(path.join(temporaryRoot, 'events.ndjson'), 'utf8');
        assert.match(events, /session\.start/);
        assert.match(events, /assistant\.message/);
        assert.match(events, /session\.idle/);

        const metadata = JSON.parse(
            await readFile(path.join(temporaryRoot, 'metadata.json'), 'utf8')
        ) as Record<string, unknown>;
        assert.equal(metadata.runtime, 'github-copilot-sdk');
        assert.equal(metadata.sdkVersion, '1.0.10-preview.0');
        assert.equal(metadata.sessionId, 'mock-session');
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});

test('SDK worker aborts and cleans up after timeout or cancellation failure', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spe-sdk-timeout-'));
    const options = await buildInvocationOptions('reviewer', temporaryRoot);
    const client = new MockClient(async () => {
        throw new Error('SDK request timed out');
    });

    try {
        await assert.rejects(
            invokeSdkWorker(options, factoryFor(client)),
            /timed out/
        );
        assert.equal(client.session?.aborted, true);
        assert.equal(client.session?.disconnected, true);
        assert.equal(client.stopped, true);
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});

test('SDK worker fails when client cleanup is incomplete', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spe-sdk-cleanup-'));
    const options = await buildInvocationOptions('reviewer', temporaryRoot);
    const client = new MockClient(async config => {
        emitCompleted(config);
        return assistantResponse();
    }, [new Error('runtime process remained alive')]);

    try {
        await assert.rejects(
            invokeSdkWorker(options, factoryFor(client)),
            /worker cleanup failed: runtime process remained alive/
        );
        assert.match(
            await readFile(path.join(temporaryRoot, 'stderr.log'), 'utf8'),
            /SDK cleanup failed/
        );
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});

test('SDK worker fails on permission rejection, session errors, or missing completion evidence', async () => {
    const scenarios: Array<{
        name: string;
        send: (config: MockSessionConfig) => Promise<SdkAssistantMessage | undefined>;
        expected: RegExp;
    }> = [
        {
            name: 'permission',
            send: async config => {
                await config.onPermissionRequest?.({ kind: 'shell' }, { sessionId: 'mock' });
                emitCompleted(config);
                return assistantResponse();
            },
            expected: /requested denied authority/
        },
        {
            name: 'session-error',
            send: async config => {
                config.onEvent?.({ type: 'session.error', data: { message: 'runtime failed' } });
                emitCompleted(config);
                return assistantResponse();
            },
            expected: /runtime failed/
        },
        {
            name: 'missing-idle',
            send: async config => {
                config.onEvent?.({
                    type: 'assistant.message',
                    data: { content: validReviewerJson() }
                });
                return assistantResponse();
            },
            expected: /without complete/
        }
    ];

    for (const scenario of scenarios) {
        const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `spe-sdk-${scenario.name}-`));
        const options = await buildInvocationOptions('reviewer', temporaryRoot);
        try {
            await assert.rejects(
                invokeSdkWorker(options, factoryFor(new MockClient(scenario.send))),
                scenario.expected
            );
        } finally {
            await rm(temporaryRoot, { recursive: true, force: true });
        }
    }
});

test('SDK environment removes non-authentication secrets', () => {
    const environment = buildSdkEnvironment({
        PATH: 'C:\\Program Files\\nodejs',
        AZURE_CLIENT_SECRET: 'secret',
        GITHUB_TOKEN: 'github-auth',
        KEEP_ME: 'value'
    });

    assert.equal(environment.AZURE_CLIENT_SECRET, undefined);
    assert.equal(environment.GITHUB_TOKEN, 'github-auth');
    assert.equal(environment.KEEP_ME, 'value');
});

async function buildInvocationOptions(
    role: 'implementer' | 'reviewer',
    artifactDir?: string
): Promise<InvocationOptions<WorkerResult | Record<string, unknown>>> {
    const repoRoot = await findRepositoryRoot(path.resolve(__dirname, '..', '..', '..'));
    const loaded = loadContract(
        repoRoot,
        path.join(repoRoot, '.agent', 'contracts', 'examples', 'storage-explorer-bulk-restore.json')
    );
    return {
        repoRoot,
        worktreePath: repoRoot,
        artifactDir: artifactDir ?? path.join(repoRoot, '.agent-runs', 'test-sdk'),
        runId: 'test-run',
        baseCommit: '0'.repeat(40),
        contract: loaded.contract,
        policy: loaded.policy,
        assignment: requireSingleRole(loaded.contract, role),
        resultSchemaPath: path.join(
            repoRoot,
            '.agent',
            'schemas',
            role === 'reviewer' ? 'review-result.schema.json' : 'worker-result.schema.json'
        ),
        validate: value => (
            value && typeof value === 'object'
                ? []
                : ['Expected object']
        ),
        sdkRuntime: {
            sdkVersion: '1.0.10-preview.0',
            cliPath: process.execPath,
            cliVersion: 'mock-cli',
            model: 'auto',
            reasoningEffort: 'high',
            availableTools: ['view', 'grep', 'glob', 'create', 'edit']
        }
    };
}

function factoryFor(client: MockClient): SdkClientFactory {
    return () => client;
}

function assistantResponse(): SdkAssistantMessage {
    return {
        type: 'assistant.message',
        data: { content: validReviewerJson() }
    };
}

function emitCompleted(config: MockSessionConfig): void {
    config.onEvent?.({
        type: 'assistant.message',
        data: { content: validReviewerJson() }
    });
    config.onEvent?.({ type: 'session.idle', data: {} });
}

function validReviewerJson(): string {
    return JSON.stringify({
        schemaVersion: '1.0',
        runId: 'test-run',
        taskId: 'storage-explorer-bulk-restore',
        workerId: 'review-0',
        role: 'reviewer',
        decision: 'blocked',
        summary: 'Mock SDK lifecycle result.',
        reviewedCommit: '1'.repeat(40),
        findings: [],
        criteria: [],
        risks: [],
        approvalRequests: []
    });
}
