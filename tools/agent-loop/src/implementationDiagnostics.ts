import type { ImplementationStage } from './orchestrator';
import { ProposalConflictError } from './git';
import type { ReviewResult, TaskContract, WorkerResult } from './types';

export function describeReviewStop(
    review: Pick<ReviewResult, 'decision' | 'findings'> & Partial<Pick<ReviewResult, 'criteria'>>,
    repairs: number, reviewRepairs: number
): string {
    const safeId = (id: string) => /^AC-\d{2,4}$/.test(id);
    const criteria = (review.criteria ?? []).filter(c => safeId(c.id) &&
        ['not-satisfied', 'not-verifiable'].includes(c.status)).slice(0, 12).map(c => `${c.id} ${c.status}`);
    const scenarios = (review.criteria ?? []).flatMap(c => (c.scenarios ?? []).filter(s =>
        s.id.startsWith(`${c.id}-S`) && /^AC-\d{2,4}-S\d$/.test(s.id) && s.status !== 'satisfied' && observations.has(s.observed)))
        .slice(0, 12).map(s => `${s.id} ${s.observed}`);
    const findings = review.findings.filter(f => ['blocker', 'high', 'medium', 'low'].includes(f.severity) &&
        ['correctness', 'security', 'reliability', 'testing', 'architecture', 'contract'].includes(f.category))
        .slice(0, 6).map(f => `${f.severity} ${f.category} (${f.criterionIds.filter(safeId).slice(0, 12).join(', ') || 'general'})`);
    return [
        review.decision === 'blocked' ? 'Independent review was blocked.' : 'Independent review requested changes.',
        `Repair passes: ${repairs}; review-directed: ${reviewRepairs}.`,
        ...(criteria.length ? [`Criteria: ${criteria.join(', ')}.`] : []),
        ...(scenarios.length ? [`Open scenarios: ${scenarios.join(', ')}.`] : []),
        ...(findings.length ? [`Findings: ${findings.join('; ')}.`] : ['No structured findings reported.']),
    ].join(' ');
}

const approvalActions = new Map([
    ['network-access', 'Use a recorded fixture or mock instead of contacting the service.'],
    ['live-cloud-mutation', 'Use a mock tenant operation instead of changing live resources.'],
    ['new-graph-beta-endpoint', 'Check whether the existing approved Graph client and mocked permission response cover the request.'],
    ['authentication-scope-change', 'Have the maintainer review the required scope or choose a design using existing permissions.'],
    ['dependency-change', 'Check whether an existing locked dependency covers the feature.'],
    ['security-boundary-change', 'Review the proposed boundary change separately from the feature.'],
    ['telemetry-change', 'Review whether new telemetry is necessary for the requested behavior.'],
    ['authority-expansion', 'Check the task scope and split out work that cannot run within it.'],
    ['budget', 'Narrow the assignment or have a maintainer review its time and credit limits.'],
]);

const blockerActions = {
    'missing-context': 'Resolve the conflicting requirement or missing prerequisite in the affected criterion. Routine presentation choices do not require approval.',
    'edit-scope': 'The worker reported needing a path outside its allowed edits. Inspect the contract paths or narrow the requested change before retrying.',
    'fixture-unavailable': 'Provide a synthetic fixture that exercises the required behavior offline.',
    'implementation-incomplete': 'Narrow the affected criterion or isolate it as a smaller change.',
    'budget-exhausted': 'Reduce the size of the assignment or review its configured limits.',
};

// Results whose last attempt repeated the previous open scenarios with no new code or evidence.
export const noProgressResults = new WeakSet<WorkerResult>();

const safeCriterionId = (id: string) => /^AC-\d{2,4}$/.test(id);
const safeScenarioId = (id: string) => /^AC-\d{2,4}-S\d$/.test(id);
const observations = new Set(['verified', 'not-implemented', 'not-covered', 'assertion-failed', 'build-failed', 'fixture-unavailable', 'not-verifiable']);
// Public issue text only, reduced to the issue diagnostic character set.
export const publicExpectation = (text: string) => text.replace(/[^A-Za-z0-9 ().,:;'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140).replace(/[\s.,:;]+$/, '');

type ScenarioCatalog = Pick<TaskContract, 'acceptanceCriteria'>;

export function describeOpenScenarios(worker: WorkerResult, contract?: ScenarioCatalog): string[] {
    const catalog = new Map((contract?.acceptanceCriteria ?? []).flatMap(c => (c.scenarios ?? []).map(s => [s.id, { parent: c.id, s }] as const)));
    const notes: string[] = [];
    for (const criterion of worker.criteria) {
        if (!['blocked', 'not-satisfied'].includes(criterion.status) || !safeCriterionId(criterion.id)) continue;
        const declared = (contract?.acceptanceCriteria ?? []).find(c => c.id === criterion.id)?.scenarios ?? [];
        const reported = (criterion.scenarios ?? []).filter(s => safeScenarioId(s.id) && catalog.get(s.id)?.parent === criterion.id);
        const open = reported.filter(s => ['blocked', 'not-satisfied'].includes(s.status));
        for (const scenario of open.slice(0, 4)) {
            const expected = publicExpectation(catalog.get(scenario.id)!.s.description);
            const observed = observations.has(scenario.observed) ? scenario.observed : 'not-verifiable';
            notes.push(`Scenario ${scenario.id} of ${criterion.id} still fails (expected: ${expected}; observed: ${observed}).`);
        }
        const passed = reported.filter(s => s.status === 'satisfied').map(s => s.id);
        if (passed.length) notes.push(`Kept passing scenarios: ${passed.join(', ')}.`);
        if (declared.length && !reported.length) {
            notes.push(`Scenarios ${declared.map(s => s.id).join(', ')} of ${criterion.id} were not reported individually.`);
        }
    }
    return notes;
}

// Only controlled categories, roles, counts, criterion IDs and public scenario text may reach the public issue.
export class IncompleteWorkersError extends Error {
    constructor(workers: WorkerResult[], contract?: ScenarioCatalog) {
        super(workers.map(worker => {
            const role = worker.role === 'sdet' ? 'Test worker' : 'Implementation worker';
            const ids = [...new Set(worker.criteria.filter(c => ['blocked', 'not-satisfied'].includes(c.status) &&
                safeCriterionId(c.id)).map(c => c.id))].slice(0, 12);
            const prefix = `${role}${ids.length ? ` (${ids.join(', ')})` : ''}`;
            if (worker.approvalRequests.length) {
                const categories = [...new Set(worker.approvalRequests.map(a => {
                    const key = a.category.trim().toLowerCase();
                    return approvalActions.has(key) ? key : 'unclassified';
                }))];
                const next = categories.map(c => approvalActions.get(c) ??
                    'Have a maintainer check the task scope; the worker did not identify a known permission.').join(' ');
                return `${prefix} requested approval: ${categories.join(', ')}. No additional permission was granted. ${next}`;
            }
            const code = worker.blockerCode;
            const cause = code ? `${code}. ${blockerActions[code]}` :
                'No specific blocker was reported. Inspect the affected criteria and split out any missing prerequisite.';
            const stalled = noProgressResults.has(worker)
                ? ['Stopped early: the last two attempts reported the same open scenarios with no new code or evidence.'] : [];
            const kept = worker.outputCommit && worker.filesChanged.length
                ? [`The last scoped checkpoint changed ${worker.filesChanged.length} file(s) and is kept in the run record.`] : [];
            return [`${prefix} reported ${worker.status === 'failed' ? 'failure' : 'blocked'}: ${cause}`,
                ...describeOpenScenarios(worker, contract), ...stalled, ...kept].join(' ');
        }).join(' '));
    }
}

export function describeImplementationFailure(stage: ImplementationStage, error: unknown): string {
    const detail = error instanceof Error ? error.message : '';
    let reason = 'The agent could not complete this stage.';
    if (error instanceof IncompleteWorkersError) {
        reason = error.message;
    } else if (error instanceof ProposalConflictError) {
        reason = `The previous proposal conflicts with the current default branch in ${error.paths.length} file(s). Nothing was resolved automatically. Update the proposal branch from the default branch or remove the Modifications section for a fresh run.`;
    } else if (/^The previous proposal (?:is already part of|is missing|was not pinned)/.test(detail)) {
        reason = detail;
    } else if (stage === 'copilot-preflight') {
        if (/protocol version mismatch/i.test(detail)) {
            reason = 'The pinned Copilot CLI and SDK are incompatible.';
        } else if (/authentication is unavailable|\b401\b|bad credentials/i.test(detail)) {
            reason = 'Copilot authentication failed. Check the feature-agent environment secret and account access.';
        } else if (/model .* (?:not available|disabled by policy|does not support)|AGENT_LOOP_REASONING_EFFORT/i.test(detail)) {
            reason = 'The configured Copilot model or reasoning effort is unavailable.';
        } else {
            reason = 'Copilot runtime preflight failed. Check the pinned CLI and SDK setup.';
        }
    } else if (/^Unable to provision (?:root|webview) dependencies/.test(detail)) {
        reason = 'A worktree could not install its locked dependencies from the runner cache.';
    } else if (/^Copilot SDK worker .* requested denied authority:|^Worker changed paths outside its authority:/.test(detail)) {
        reason = 'A worker requested or made a change outside its allowed scope. Check the assignment paths and use offline fixtures for service calls.';
    } else if (/^(?:SDK worker returned malformed JSON|SDK worker final response must be|SDK worker result failed structured validation)/.test(detail)) {
        reason = 'A worker did not return the required structured result. Check worker output schema compatibility with the pinned SDK.';
    } else if (/^Run exceeded \d+ minute wall-clock budget/.test(detail)) {
        reason = 'The run reached its time budget. Split the issue into smaller independent changes.';
    } else if (/^Timeout waiting for|\b(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN)\b/.test(detail)) {
        reason = 'The worker session timed out or lost its SDK connection. Check Copilot service availability before retrying.';
    } else if (/\b(?:ENOENT|EPERM|EACCES)\b[\s\S]*\brun\.json\.tmp\b/.test(detail)) {
        reason = 'The runner could not save the shared run record.';
    } else if (stage === 'contract') {
        reason = 'The workflow could not load the task contract or verify the pinned base.';
    }
    return `Feature agent stopped during ${stage}: ${reason}`;
}
