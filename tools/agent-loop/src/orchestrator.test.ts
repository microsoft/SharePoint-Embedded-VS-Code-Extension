import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { buildWorkerSdkArtifacts, formatValidationSummary } from './orchestrator';
import { ValidationResult } from './types';

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
