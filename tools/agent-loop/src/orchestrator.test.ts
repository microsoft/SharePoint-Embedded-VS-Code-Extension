import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
    buildWorkerSdkArtifacts,
    ensureValidationClientDeclaration,
    formatContinuationContext,
    formatValidationSummary,
    selectTerminalWorkerResults
} from './orchestrator';
import { ValidationResult, WorkerResult } from './types';

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
