import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
    buildWorkerSdkArtifacts,
    ensureValidationClientDeclaration,
    enforceReviewGate,
    formatContinuationContext,
    formatValidationSummary,
    integrateInitialWorkers,
    selectTerminalWorkerResults
} from './orchestrator';
import { ReviewResult, ValidationResult, WorkerResult } from './types';

test('initial integration preserves all commits in an implementer continuation', async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'spe-integration-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'Agent test');
    git('config', 'user.email', 'test@example.com');
    git('commit', '-q', '--allow-empty', '-m', 'Base');
    const base = git('rev-parse', 'HEAD');
    async function commit(message: string, file: string): Promise<string> {
        await writeFile(path.join(cwd, file), message);
        git('add', file);
        git('commit', '-qm', message);
        return git('rev-parse', 'HEAD');
    }
    const first = await commit('Initial implementation', 'first.txt');
    const continued = await commit('Continuation', 'continued.txt');
    git('switch', '--detach', '-q', base);
    const testCommit = await commit('Tests', 'test.txt');
    git('switch', '--detach', '-q', base);
    const worker = (role: WorkerResult['role'], outputCommit: string): WorkerResult => ({
        schemaVersion: '1.0', role, outputCommit, baseCommit: base, status: 'completed', runId: 'run',
        taskId: 'task', workerId: role, startedAt: '', finishedAt: '', summary: role,
        criteria: [], filesChanged: [], validations: [], artifacts: [], risks: [], approvalRequests: []
    });
    await integrateInitialWorkers(cwd, base, [worker('implementer', first), worker('sdet', testCommit),
        worker('implementer', continued)]);
    assert.deepEqual(git('ls-tree', '--name-only', 'HEAD').split(/\r?\n/), ['continued.txt', 'first.txt', 'test.txt']);
});

test('a reviewer cannot pass without evidence for all required criteria', () => {
    const report = (): ReviewResult => ({
        schemaVersion: '1.0', runId: 'run', taskId: 'task', workerId: 'reviewer', reviewedCommit: 'a'.repeat(40),
        summary: 'Pass', decision: 'pass', findings: [],
        criteria: [{ id: 'AC-01', status: 'satisfied', evidence: 'Regression test covers the outcome.' }],
    });
    const valid = report();
    enforceReviewGate(valid, ['AC-01']);
    assert.equal(valid.decision, 'pass');
    const missing = report();
    enforceReviewGate(missing, ['AC-01', 'AC-02']);
    assert.equal(missing.decision, 'blocked');
    const high = report();
    high.findings.push({ id: 'F-01', severity: 'high', category: 'correctness', criterionIds: ['AC-01'],
        rationale: 'Incorrect result', evidence: 'Regression', repassInstruction: 'Fix the result' });
    enforceReviewGate(high, ['AC-01']);
    assert.equal(high.decision, 'blocked');
});

test('validation handoff omits passing output and bounds failure excerpts', () => {
    const longOutput = `start-${'x'.repeat(2000)}-end`;
    const validation: ValidationResult[] = [
        {
            command: 'npm run lint',
            status: 'passed',
            exitCode: 0,
            durationSeconds: 1,
            outputArtifact: 'lint.log',
            stdoutTail: 'passing output should not be embedded'
        },
        {
            command: 'npm run test:ui',
            status: 'failed',
            exitCode: 1,
            durationSeconds: 2,
            outputArtifact: 'ui.log',
            stdoutTail: longOutput
        }
    ];

    const summary = formatValidationSummary(validation);

    assert.match(summary, /PASSED: npm run lint/);
    assert.match(summary, /fullOutput=lint\.log/);
    assert.doesNotMatch(summary, /passing output should not be embedded/);
    assert.match(summary, /\[showing last 1500 characters\]/);
    assert.match(summary, /-end/);
    assert.ok(summary.length < 2500);
});

test('validation creates and removes a declaration when the ignored client source is absent', async () => {
    const worktree = await mkdtemp(path.join(os.tmpdir(), 'agent-loop-validation-'));
    await mkdir(path.join(worktree, 'src'));

    const cleanup = await ensureValidationClientDeclaration(worktree);
    const declaration = await readFile(path.join(worktree, 'src', 'client.d.ts'), 'utf8');

    assert.match(declaration, /clientId: string/);
    assert.match(declaration, /telemetryKey: string/);
    await cleanup();
    await assert.rejects(
        readFile(path.join(worktree, 'src', 'client.d.ts'), 'utf8'),
        /ENOENT/
    );
});

test('worker handoff points to SDK-native evidence files', () => {
    const artifacts = buildWorkerSdkArtifacts(path.join('run', 'workers', 'implementation'));

    assert.deepEqual(
        artifacts.map(artifact => ({
            type: artifact.type,
            file: path.basename(artifact.path)
        })),
        [
            { type: 'copilot-sdk-events', file: 'events.ndjson' },
            { type: 'copilot-sdk-metadata', file: 'metadata.json' }
        ]
    );
    assert.equal(artifacts.some(artifact => artifact.path.includes('copilot-logs')), false);
});

test('terminal worker selection keeps the latest result for each role', () => {
    const result = (workerId: string, role: WorkerResult['role'], status: WorkerResult['status']): WorkerResult => ({
        schemaVersion: '1.0',
        runId: 'run',
        taskId: 'task',
        workerId,
        role,
        status,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        baseCommit: 'base',
        outputCommit: status === 'failed' ? null : 'commit',
        summary: workerId,
        criteria: [],
        filesChanged: [],
        validations: [],
        artifacts: [],
        risks: [],
        approvalRequests: []
    });

    assert.deepEqual(
        selectTerminalWorkerResults([
            result('implementation-initial', 'implementer', 'blocked'),
            result('test-engineering-initial', 'sdet', 'completed'),
            result('implementation-continuation-1', 'implementer', 'completed')
        ]).map(item => item.workerId),
        ['implementation-continuation-1', 'test-engineering-initial']
    );
});

test('continuation handoff includes only unfinished criteria and checkpoint context', () => {
    const result: WorkerResult = {
        schemaVersion: '1.0',
        runId: 'run',
        taskId: 'task',
        workerId: 'implementation-initial',
        role: 'implementer',
        status: 'blocked',
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        baseCommit: 'base',
        outputCommit: 'checkpoint',
        summary: 'Partial implementation',
        criteria: [
            { id: 'AC-01', status: 'satisfied', evidence: 'done' },
            { id: 'AC-10', status: 'not-satisfied', evidence: 'remaining' }
        ],
        filesChanged: ['src/example.ts'],
        validations: [],
        artifacts: [],
        risks: ['compile risk'],
        approvalRequests: [{ category: 'budget', reason: 'continue' }]
    };

    const context = formatContinuationContext(result);
    assert.match(context, /checkpoint/);
    assert.match(context, /AC-10/);
    assert.doesNotMatch(context, /AC-01/);
    assert.match(context, /compile risk/);
});
