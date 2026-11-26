import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { writeRunRecord } from './evidence';
import { committedChangedPaths, ProposalConflictError, reapplyCommit } from './git';
import { describeImplementationFailure, describeReviewStop, describeValidationStop, IncompleteWorkersError, noProgressResults, repairFocus } from './implementationDiagnostics';
import {
    buildWorkerSdkArtifacts,
    ensureValidationClientDeclaration,
    enforceReviewGate,
    evaluateCandidate,
    featureTestNames,
    formatContinuationContext,
    formatValidationSummary,
    integrateInitialWorkers,
    nextRepair,
    recoverWorker,
    selectTerminalWorkerResults
} from './orchestrator';
import { ReviewResult, RunRecord, ValidationResult, WorkerProgress, WorkerResult } from './types';

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
        return { ...failed, criteria: [{ id: 'AC-01', status: 'blocked', evidence: `attempt ${calls}` }] };
    }, () => {}).then(result => result.status), 'failed');
    assert.equal(calls, 3);
    const stop = () => assert.fail('Do not retry budget or authority blockers.');
    const budget = { ...failed, approvalRequests: [{ category: 'budget', reason: 'Requires more time' }] };
    assert.equal(await recoverWorker('base', 2, async () => budget, stop), budget);
    const exhausted = { ...failed, blockerCode: 'budget-exhausted' as const };
    assert.equal(await recoverWorker('base', 2, async () => exhausted, stop), exhausted);
    const outsideScope = { ...failed, blockerCode: 'edit-scope' as const };
    assert.equal(await recoverWorker('base', 2, async () => outsideScope, stop), outsideScope);
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

test('the repair focus contains only scoped IDs and observations, never worker prose', () => {
    const w = recoveryResult('blocked', null);
    w.criteria = [{ id: 'AC-03', status: 'blocked', evidence: 'private evidence', scenarios: [
        { id: 'AC-03-S1', status: 'satisfied', observed: 'verified' },
        { id: 'AC-03-S2', status: 'blocked', observed: 'not-covered' },
        { id: 'AC-02-S1', status: 'blocked', observed: 'assertion-failed' },
    ] }];
    assert.equal(new IncompleteWorkersError([w]).focus, 'AC-03-S2=not-covered,AC-03-S1=verified');
    w.approvalRequests = [{ category: 'network-access', reason: 'private' }];
    assert.equal(new IncompleteWorkersError([w]).focus, '');
    assert.equal(repairFocus([{id: 'AC-03', status:'not-verifiable', evidence:'private'}]), 'AC-03=unresolved');
    const diagnostic = describeValidationStop([{ command: 'npm run test:api', status: 'failed', exitCode: 1, durationSeconds: 7, stderrTail: 'private output' }]);
    assert.match(diagnostic, /offline API check failed/);
    assert.doesNotMatch(diagnostic, /private output/);
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
    assert.deepEqual(await committedChangedPaths(cwd, base, 'HEAD', true), ['src/utils/example.ts']);
});

test('native capture selects changed behavior-named entrypoints, not other tests or helpers', () => {
    const names = ['container-creation-confirmation.scenario.ts', 'container-type-owner-properties.scenario.ts'];
    assert.deepEqual(featureTestNames([
        ...names.map(name => `src/test/native/${name}`).reverse(),
        'src/test/native/captureWorkbench.ts', 'src/test/native/helpers/seed-owner.ts',
        'ui-tests/api/container-create-notification.api.spec.ts'
    ]), { nativeScenarios: names });
    for (const file of ['src/test/native/github-issue-84.ts', 'src/test/native/issue-85.scenario.ts',
        'ui-tests/api/issue-84.api.spec.ts', 'src/test/native/owner-properties.ts']) {
        assert.ok(featureTestNames([file]).error, file);
    }
    assert.deepEqual(featureTestNames([]), { nativeScenarios: [] });
});

test('a reviewer cannot pass without evidence for all required criteria', () => {
    const report = (): ReviewResult => ({
        schemaVersion: '1.0', runId: 'run', taskId: 'task', workerId: 'reviewer', reviewedCommit: 'a'.repeat(40),
        summary: 'Pass', decision: 'pass', findings: [],
        criteria: [{ id: 'AC-01', status: 'satisfied', evidence: 'Regression test covers the outcome.' }],
    });
    const valid = report();
    valid.advisories = ['omit-optional-preview', 'optional-hardening'];
    enforceReviewGate(valid, ['AC-01']);
    assert.equal(valid.decision, 'pass');
    const missing = report();
    missing.advisories = ['optional-hardening'];
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

test('a single editor repairs the first failed gate before any reviewer invocation', async () => {
    const contract = {
        requiredChecks: [{ id: 'types', command: 'tsc', timeoutMinutes: 1 }, { id: 'ui', command: 'ui', timeoutMinutes: 2 }],
        acceptanceCriteria: [{ id: 'AC-01', description: 'Show the result.', evidence: 'Visible state.' }]
    };
    const failed: ValidationResult = { command: 'tsc', status: 'failed', exitCode: 1, durationSeconds: 1, stderrTail: 'Type mismatch' };
    let reviews = 0;
    const review = async () => {
        reviews++;
        return { decision: 'blocked' as const, summary: 'Independent review still decides.', findings: [] };
    };
    const repair = await evaluateCandidate(true, [failed], contract, review);
    assert.equal(repair.decision, 'changes-required');
    assert.equal(repair.findings[0].evidence, 'Type mismatch');
    const green = { ...failed, status: 'passed' as const, exitCode: 0 };
    await assert.rejects(evaluateCandidate(true, [green], contract, review), /incomplete/);
    assert.equal(reviews, 0);
    assert.equal((await evaluateCandidate(true, [green, { ...green, command: 'ui' }], contract, review)).decision, 'blocked');
    assert.equal(reviews, 1);
});

test('issue 81 sequence: two failed checks do not consume the first actionable review repair', async () => {
    const criteria = ['AC-01', 'AC-02'];
    const contract = {
        requiredChecks: [{ id: 'ui', command: 'ui', timeoutMinutes: 1 }],
        acceptanceCriteria: criteria.map(id => ({ id, description: 'Container creation notification', evidence: id }))
    };
    const gate: ValidationResult = { command: 'ui', exitCode: 0, durationSeconds: 1, status: 'passed' };
    const findings: ReviewResult['findings'] = [{ id: 'F-01', severity: 'high', category: 'testing',
        criterionIds: ['AC-02'], rationale: 'Failure path is not covered', evidence: 'No assertion for rejected creation',
        repassInstruction: 'Assert no success notice after rejected creation' }];
    const reviewed = { decision: 'changes-required' as const, findings, summary: 'Need failure-path evidence.' };
    let reviews = 0, reviewsRepaired = 0;
    for (let n = 0; n < 4; n++) {
        const results = n < 2 ? [{ ...gate, status: 'failed' as const, exitCode: 1 }] : [gate];
        const verdict = await evaluateCandidate(true, results, contract, async () =>
            ++reviews === 1 ? reviewed : { decision: 'pass', findings: [], summary: 'Both criteria satisfied.' });
        const repair = nextRepair(verdict, results, n, reviewsRepaired, 2, 2);
        assert.equal(repair, ['validation', 'validation', 'review', undefined][n]);
        if (repair === 'review') reviewsRepaired++;
        if (n === 3) assert.equal(verdict.decision, 'pass');
    }
    assert.equal(reviews, 2);
    assert.equal(nextRepair(reviewed, [gate], 3, 1, 2, 2), 'review');
    assert.equal(nextRepair(reviewed, [gate], 4, 2, 2, 2), undefined);
    assert.equal(nextRepair({ ...reviewed, decision: 'blocked' }, [gate], 2, 0, 2, 2), undefined);
    assert.equal(nextRepair(reviewed, [{ ...gate, status: 'failed' }], 3, 1, 2, 2), undefined);
    assert.equal(nextRepair(reviewed, [gate], 2, 0, 2), undefined); // Legacy shared budget.
    const safe = describeReviewStop({ ...reviewed, criteria: [
        { id: 'AC-02', status: 'not-verifiable', evidence: 'private evidence' }
    ] }, 3, 1);
    assert.match(safe, /AC-02 not-verifiable/);
    assert.match(safe, /high testing \(AC-02\)/);
    assert.doesNotMatch(safe, /private|Failure path is not covered/);
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

// Public acceptance criterion AC-03 from microsoft/SharePoint-Embedded-VS-Code-Extension issue 87.
const registerLater = 'If I skip registration, I can register the CT later from its context menu.';
const keepGrants = 'If it is already registered, show that status without overwriting existing grants.';
const compoundContract = {
    acceptanceCriteria: [{
        id: 'AC-03', description: `${registerLater} ${keepGrants}`, evidence: 'Demonstrate each listed scenario.',
        scenarios: [{ id: 'AC-03-S1', description: registerLater }, { id: 'AC-03-S2', description: keepGrants }]
    }]
};
function stalledScenario(evidence = 'private worker note: grants API unclear'): WorkerResult {
    const result = recoveryResult('blocked', null);
    result.blockerCode = 'implementation-incomplete';
    result.criteria = [{
        id: 'AC-03', status: 'blocked', evidence,
        scenarios: [
            { id: 'AC-03-S1', status: 'satisfied', observed: 'verified' },
            { id: 'AC-03-S2', status: 'blocked', observed: 'not-implemented' }
        ]
    }];
    return result;
}

test('a repeated compound-criterion stall with no new code or evidence stops before spending more retries', async () => {
    let calls = 0;
    const progress: WorkerProgress[] = [];
    const result = await recoverWorker('base', 2, async () => { calls++; return stalledScenario(); }, () => {}, p => progress.push(p));
    assert.equal(calls, 2);
    assert.ok(noProgressResults.has(result));
    assert.deepEqual(progress.map(p => p.noProgress), [false, true]);
    assert.deepEqual(progress[1].open, [{ id: 'AC-03-S2', observed: 'not-implemented' }]);
    assert.equal(progress[1].newCode, false);
    const message = new IncompleteWorkersError([result], compoundContract).message;
    assert.match(message, /Implementation worker \(AC-03\) reported blocked: implementation-incomplete/);
    assert.match(message, /Scenario AC-03-S2 of AC-03 still fails \(expected: If it is already registered, show that status without overwriting existing grants; observed: not-implemented\)/);
    assert.match(message, /Kept passing scenarios: AC-03-S1\./);
    assert.match(message, /Stopped early: the last two attempts reported the same open scenarios with no new code or evidence\./);
    assert.doesNotMatch(message, /private|grants API/);
    assert.match(message, /^[A-Za-z0-9 ().,:;'-]+$/);
    assert.match(describeImplementationFailure('repass', new IncompleteWorkersError([result], compoundContract)), /AC-03-S2/);
});

test('a compound-criterion retry that adds code or new evidence keeps its checkpoint and continues', async () => {
    const bases: string[] = [];
    const attempts = [
        { ...stalledScenario(), outputCommit: 'checkpoint-1', filesChanged: ['src/commands/ContainerType/RegisterOnLocalTenant.ts'] },
        stalledScenario('different evidence after the checkpoint'),
        { ...recoveryResult('completed', 'checkpoint-2'), criteria: [{ id: 'AC-03', status: 'satisfied' as const, evidence: 'tests' }] }
    ];
    const progress: WorkerProgress[] = [];
    const result = await recoverWorker('base', 2, async base => { bases.push(base); return attempts[bases.length - 1]; }, () => {}, p => progress.push(p));
    assert.equal(result.status, 'completed');
    assert.deepEqual(bases, ['base', 'checkpoint-1', 'checkpoint-1']);
    assert.deepEqual(progress.map(p => [p.newCode, p.noProgress]), [[true, false], [false, false], [true, false]]);
    assert.equal(progress[0].checkpointCommit, 'checkpoint-1');
});

test('a reviewer pass cannot hide an open scenario, and review stops name it', () => {
    const review: ReviewResult = {
        schemaVersion: '1.0', runId: 'run', taskId: 'task', workerId: 'review', reviewedCommit: 'a'.repeat(40),
        decision: 'pass', summary: 'ok', findings: [],
        criteria: [{ id: 'AC-03', status: 'satisfied', evidence: 'tests', scenarios: [
            { id: 'AC-03-S1', status: 'satisfied', observed: 'verified' },
            { id: 'AC-03-S2', status: 'not-satisfied', observed: 'assertion-failed' }
        ] }]
    };
    enforceReviewGate(review, ['AC-03']);
    assert.equal(review.decision, 'blocked');
    assert.match(describeReviewStop(review, 1, 1), /Open scenarios: AC-03-S2 assertion-failed\./);
    const complete = { ...review, decision: 'pass' as const, criteria: [{ ...review.criteria[0], scenarios: [review.criteria[0].scenarios![0]] }] };
    enforceReviewGate(complete, ['AC-03']);
    assert.equal(complete.decision, 'pass');
});

test('the previous proposal is reapplied to the current base and conflicts stop without resolution', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'spe-proposal-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const repo = path.join(root, 'repo');
    await mkdir(path.join(repo, 'src'), { recursive: true });
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    await writeFile(path.join(repo, 'src', 'register.ts'), 'export const register = 1;\n');
    await writeFile(path.join(repo, 'src', 'menu.ts'), 'export const menu = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'old main');
    const oldMain = git('rev-parse', 'HEAD');
    git('checkout', '-qb', 'proposal');
    await writeFile(path.join(repo, 'src', 'register.ts'), 'export const register = 2;\n');
    git('commit', '-qam', 'Implement SPE extension feature request #87');
    const proposal = git('rev-parse', 'HEAD');
    git('checkout', '-q', '-');
    await writeFile(path.join(repo, 'src', 'menu.ts'), 'export const menu = 2;\n');
    git('commit', '-qam', 'current main');
    const currentMain = git('rev-parse', 'HEAD');
    git('worktree', 'add', '-q', '--detach', path.join(root, 'seed'), currentMain);
    const seed = await reapplyCommit(repo, path.join(root, 'seed'), oldMain, proposal, path.join(root, 'a', 'p.patch'), 'seed');
    assert.deepEqual(seed.paths, ['src/register.ts']);
    assert.equal(git('rev-parse', `${seed.commit}^`), currentMain);
    assert.match(git('show', `${seed.commit}:src/menu.ts`), /menu = 2/);
    assert.match(git('show', `${seed.commit}:src/register.ts`), /register = 2/);

    await writeFile(path.join(repo, 'src', 'register.ts'), 'export const register = 3;\n');
    git('commit', '-qam', 'conflicting main');
    git('worktree', 'add', '-q', '--detach', path.join(root, 'conflict'), 'HEAD');
    await assert.rejects(reapplyCommit(repo, path.join(root, 'conflict'), oldMain, proposal, path.join(root, 'b', 'p.patch'), 'seed'),
        (error: unknown) => error instanceof ProposalConflictError && error.paths.join() === 'src/register.ts');
    assert.equal(execFileSync('git', ['-C', path.join(root, 'conflict'), 'status', '--porcelain'], { encoding: 'utf8' }), '');
    assert.match(describeImplementationFailure('implementation', new ProposalConflictError(['src/register.ts'])),
        /conflicts with the current default branch in 1 file\(s\)\. Nothing was resolved automatically/);
});
