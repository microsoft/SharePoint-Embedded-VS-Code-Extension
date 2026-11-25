import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { writeRunRecord } from './evidence';
import { committedChangedPaths } from './git';
import { describeImplementationFailure, IncompleteWorkersError } from './implementationDiagnostics';
import {
    buildWorkerSdkArtifacts,
    ensureValidationClientDeclaration,
    enforceReviewGate,
    formatContinuationContext,
    formatValidationSummary,
    integrateInitialWorkers,
    recoverWorker,
    selectTerminalWorkerResults
} from './orchestrator';
import { ReviewResult, RunRecord, ValidationResult, WorkerResult } from './types';

function recoveryResult(status: WorkerResult['status'], outputCommit: string | null): WorkerResult {
    return {
        schemaVersion: '1.0', runId: 'run', taskId: 'task', workerId: 'worker', role: 'implementer',
        status, outputCommit, baseCommit: 'base', startedAt: '', finishedAt: '', summary: '',
        criteria: [], filesChanged: [], validations: [], artifacts: [], risks: [], approvalRequests: []
    };
}

test('worker recovery resumes from a checkpoint and retries transient failures', async () => {
    const blocked = recoveryResult('blocked', 'checkpoint');
    const completed = { ...blocked, status: 'completed' as const };
    let retries = 0;
    const result = await recoverWorker('base', 2, async (base, attempt, prior) => {
        assert.equal(base, attempt ? 'checkpoint' : 'base');
        if (attempt === 0) return blocked;
        assert.equal(prior, blocked);
        if (attempt === 1) throw new Error('ECONNRESET');
        return completed;
    }, () => { retries++; });
    assert.equal(result, completed);
    assert.equal(retries, 2);
});

test('worker recovery is bounded and stops on exhaustion or enforced authority errors', async () => {
    const failed = recoveryResult('failed', null);
    let calls = 0;
    assert.equal(await recoverWorker('base', 2, async base => {
        assert.equal(base, 'base');
        calls++;
        return failed;
    }, () => {}), failed);
    assert.equal(calls, 3);
    const stop = () => assert.fail('Do not retry budget or authority blockers.');
    const budget = { ...failed, approvalRequests: [{ category: 'budget', reason: 'Requires more time' }] };
    assert.equal(await recoverWorker('base', 2, async () => budget, stop), budget);
    const exhausted = { ...failed, blockerCode: 'budget-exhausted' as const };
    assert.equal(await recoverWorker('base', 2, async () => exhausted, stop), exhausted);
    await assert.rejects(recoverWorker('base', 2, async () => {
        throw new Error('Copilot SDK worker requested denied authority: ETIMEDOUT');
    }, stop), /denied authority/);
});

test('an approval request can recover via a different plan, without inheriting the requesting attempt', async () => {
    const checkpoint = recoveryResult('blocked', 'scoped-checkpoint');
    const approval = { ...recoveryResult('blocked', 'never-use-this-commit'), approvalRequests: [
        { category: 'network-access', reason: 'Requests a live service' }
    ] };
    const completed = recoveryResult('completed', 'offline-implementation');
    const recoveries: boolean[] = [];
    const result = await recoverWorker('base', 2, async (base, attempt, prior, offline) => {
        if (attempt === 0) return checkpoint;
        assert.equal(base, 'scoped-checkpoint');
        if (attempt === 1) {
            assert.equal(offline, false);
            assert.equal(prior, checkpoint);
            return approval;
        }
        assert.equal(offline, true);
        assert.equal(prior, undefined);
        return completed;
    }, newPlan => recoveries.push(newPlan));
    assert.equal(result, completed);
    assert.deepEqual(recoveries, [false, true]);
});

test('a second approval request stops; a transport retry cannot lift offline constraints', async () => {
    const approval = { ...recoveryResult('blocked', null), approvalRequests: [{ category: 'network-access', reason: '' }] };
    const modes: boolean[] = [];
    const recoveries: boolean[] = [];
    const result = await recoverWorker('base', 3, async (base, attempt, prior, offline) => {
        assert.equal(base, 'base');
        assert.equal(prior, undefined);
        modes.push(offline);
        if (attempt === 1) throw new Error('ECONNRESET');
        return approval;
    }, newPlan => recoveries.push(newPlan));
    assert.equal(result, approval);
    assert.deepEqual(modes, [false, true, true]);
    assert.deepEqual(recoveries, [true, false]);
});

test('parallel workers can persist the same run record without a temporary file collision', async t => {
    const artifactsDir = await mkdtemp(path.join(os.tmpdir(), 'spe-run-record-'));
    t.after(() => rm(artifactsDir, { recursive: true, force: true }));
    const run: RunRecord = {
        schemaVersion: '1.0', runId: 'run', taskId: 'task', contractPath: '',
        repoRoot: artifactsDir, baseCommit: 'a'.repeat(40), integrationBranch: 'test', phase: 'implementing',
        repass: 0, startedAt: '', updatedAt: '', artifactsDir, worktreeRoot: artifactsDir,
        workers: [], reviewArtifacts: [], errors: [],
        sdkRuntime: { sdkVersion: 'test', cliPath: '', cliVersion: 'test', model: 'test', availableTools: [] }
    };
    const writes = Array.from({ length: 20 }, () => writeRunRecord(artifactsDir, run));
    run.phase = 'integrating';
    await Promise.all([...writes, writeRunRecord(artifactsDir, run)]);
    assert.deepEqual(JSON.parse(await readFile(path.join(artifactsDir, 'run.json'), 'utf8')), run);
});

test('public implementation diagnostics classify the failure without printing raw error text', () => {
    const protocol = describeImplementationFailure('copilot-preflight', new Error('SDK protocol version mismatch: private details'));
    assert.match(protocol, /copilot-preflight: The pinned Copilot CLI and SDK are incompatible/);
    assert.doesNotMatch(protocol, /private details/);
    const writeFailure = describeImplementationFailure('implementation', new Error("ENOENT: rename '/private/run.json.tmp'"));
    assert.match(writeFailure, /implementation: The runner could not save the shared run record/);
    assert.doesNotMatch(writeFailure, /private/);
    assert.equal(describeImplementationFailure('review', new Error('Model-provided text')),
        'Feature agent stopped during review: The agent could not complete this stage.');
});

test('terminal worker diagnostics retain actionable blockers but not raw worker text', () => {
    const result = recoveryResult('blocked', null);
    result.summary = 'private runner file';
    result.criteria = [{ id: 'AC-01', status: 'blocked', evidence: 'private fixture' }];
    result.approvalRequests = [
        { category: 'new-graph-beta-endpoint', reason: 'private approval context' },
        { category: 'private custom category', reason: 'private' }
    ];
    const other = recoveryResult('failed', null);
    other.role = 'sdet';
    other.blockerCode = 'fixture-unavailable';
    const message = describeImplementationFailure('implementation', new IncompleteWorkersError([result, other]));
    assert.match(message, /Implementation worker \(AC-01\) requested approval: new-graph-beta-endpoint, unclassified/);
    assert.match(message, /No additional permission was granted/);
    assert.match(message, /Test worker reported failure: fixture-unavailable. Provide a synthetic fixture/);
    assert.doesNotMatch(message, /private/);
});

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

test('a rename out of a protected path keeps both paths visible to proposal classification', async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'spe-proposal-rename-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'Agent test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'diff.renames', 'true');
    await mkdir(path.join(cwd, 'src', 'utils'), { recursive: true });
    await writeFile(path.join(cwd, 'package.json'), '{}\n');
    git('add', 'package.json');
    git('commit', '-qm', 'Base');
    const base = git('rev-parse', 'HEAD');
    git('mv', 'package.json', 'src/utils/example.ts');
    git('commit', '-qm', 'Move configuration');
    assert.deepEqual(await committedChangedPaths(cwd, base), ['package.json', 'src/utils/example.ts']);
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
    const empty = report();
    enforceReviewGate(empty, ['AC-01'], false);
    assert.equal(empty.decision, 'changes-required');
    assert.match(empty.findings[0].repassInstruction, /instead of inventing edits/);
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

test('missing-context recovery directs approved workers to choose a default without overriding approval', () => {
    const result = recoveryResult('blocked', null);
    result.blockerCode = 'missing-context';
    const choice = /choose a reversible default/;
    assert.match(formatContinuationContext(result, true), choice);
    assert.doesNotMatch(formatContinuationContext(result), choice);
    result.approvalRequests.push({ category: 'network-access', reason: 'Requires access' });
    assert.doesNotMatch(formatContinuationContext(result, true), choice);
});
