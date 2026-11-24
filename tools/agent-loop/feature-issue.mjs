import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TITLE_PREFIX = 'Feature-Request: SPE VSC Extension -';
const READY = 'agent-ready';
const NEEDS_INFO = 'needs-info';
const HEADINGS = ['Problem', 'Expected behavior', 'Acceptance criteria', 'UI impact'];
const MAX_BODY = 12_000;
const MAX_CRITERIA = 12;

const isFeature = (issue) => typeof issue?.title === 'string' && issue.title.startsWith(TITLE_PREFIX);
const hasLabel = (issue, name) => issue.labels.some((label) => label.name.toLowerCase() === name);
const description = (value) => /[\p{L}\p{N}]/u.test(value) && !/^(?:_no response_|n\/?a|tbd|todo|none)[.!]?$/i.test(value);

function extractSections(body) {
    const sections = new Map();
    let active;
    for (const line of body.replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/)) {
        const heading = /^###\s+(.+?)\s*$/.exec(line)?.[1];
        if (heading) {
            active = HEADINGS.includes(heading) ? heading : undefined;
            if (active && sections.has(active)) return null;
            if (active) sections.set(active, []);
        } else if (active) {
            sections.get(active).push(line);
        }
    }
    return sections;
}

export function assessIssue(issue) {
    if (!isFeature(issue) || issue.state !== 'open' || issue.pull_request) return { status: 'ignored' };
    const title = issue.title.slice(TITLE_PREFIX.length).trim();
    const missing = [];
    if (issue.title[TITLE_PREFIX.length] !== ' ' || title.length < 5 || title.length > 120 || !description(title)) {
        missing.push('Use the title prefix followed by a feature name (5-120 characters).');
    }
    if (typeof issue.body !== 'string' || issue.body.length > MAX_BODY) {
        return { status: 'incomplete', missing: [...missing, 'Provide the feature form within 12,000 characters.'] };
    }
    const sections = extractSections(issue.body);
    if (!sections) return { status: 'incomplete', missing: [...missing, 'Use each feature form heading only once.'] };
    const get = (heading) => sections.get(heading)?.join('\n').trim() ?? '';
    const problem = get('Problem');
    const behavior = get('Expected behavior');
    const impact = get('UI impact');
    const criteria = (sections.get('Acceptance criteria') ?? []).map((line) =>
        /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/.exec(line)?.[1]
    ).filter((entry) => entry && description(entry) && !/^\[[ xX]\](?:\s|$)/.test(entry));
    if (!description(problem)) missing.push('Describe the problem.');
    if (!description(behavior)) missing.push('Describe the expected behavior.');
    if (!criteria.length || criteria.length > MAX_CRITERIA || criteria.some((entry) => entry.length > 500)) {
        missing.push('Provide 1-12 testable acceptance criteria as bullets (up to 500 characters each).');
    }
    if (!description(impact) && !/^none\.?$/i.test(impact)) missing.push('Describe the UI impact, or specify None.');
    return missing.length ? { status: 'incomplete', missing } : { status: 'complete', title, problem, behavior, criteria, impact };
}

export function approval(event, current, approvers) {
    if (event.action !== 'labeled' || event.label?.name !== READY || event.sender?.type !== 'User' ||
        typeof event.sender.login !== 'string' || !approvers.has(event.sender.login.toLowerCase())) {
        return { approved: false, reason: 'agent-ready was not applied by an approved maintainer.' };
    }
    if (event.issue?.id !== current.id || event.issue.number !== current.number ||
        event.issue.title !== current.title || event.issue.body !== current.body) {
        return { approved: false, reason: 'Issue text changed after approval. Reapply agent-ready after reviewing the edit.' };
    }
    const brief = assessIssue(current);
    if (brief.status !== 'complete' || !hasLabel(current, READY) ||
        hasLabel(current, NEEDS_INFO) || !hasLabel(event.issue, READY) || hasLabel(event.issue, NEEDS_INFO)) {
        return { approved: false, reason: 'Issue must be open, complete, and labeled agent-ready without needs-info.' };
    }
    return { approved: true, brief };
}

const productPaths = [
    'webview-ui/src/components/**', 'webview-ui/src/context/**', 'webview-ui/src/hooks/**',
    'webview-ui/src/pages/**', 'webview-ui/src/styles/**', 'webview-ui/src/utils/**',
    'webview-ui/src/App.tsx', 'src/utils/**', 'l10n/**',
];
const testPaths = ['src/test/**', 'ui-tests/tests/**', 'ui-tests/api/**', 'ui-tests/testids.ts'];
const restrictedUtilities = [
    'src/utils/AdminConsentHelper.ts', 'src/utils/ExtensionAppPermissions.ts',
    'src/utils/ExtensionAppPermissionScopes.ts', 'src/utils/token.ts',
];
const deniedPaths = ['**/package.json', '**/package-lock.json', '**/.npmrc', '**/.git*', '**/*config.*',
    ...restrictedUtilities];

export function publishablePath(path) {
    if (restrictedUtilities.some((restricted) => restricted.toLowerCase() === path.toLowerCase())) return false;
    if (!/^[a-z0-9_./-]+$/i.test(path) || path.split('/').some((part) =>
        part.startsWith('.') || /secret|credential/i.test(part) ||
        /^(?:node_modules|out|dist|package(?:-lock)?\.json)$/i.test(part) ||
        /(?:config\.|\.pem$|\.pfx$|\.p7s$)/i.test(part))) return false;
    return [...productPaths, ...testPaths].some((scope) =>
        scope.endsWith('/**') ? path.startsWith(scope.slice(0, -2)) : path === scope);
}

export function compileContract(issueNumber, baseCommit, brief) {
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || !/^[0-9a-f]{40}$/.test(baseCommit) ||
        brief.status !== 'complete') throw new Error('Cannot compile an invalid feature request.');
    const allowedPaths = [...productPaths, ...testPaths];
    const worker = (role, mayEdit, paths, dependsOn = [], contextInputs = []) => ({
        id: role, role, agent: `spe-${role}`, roleFile: `.agent/roles/${role}.md`,
        isolation: role === 'reviewer' ? 'read-only-checkout' : 'git-worktree',
        mayEdit, allowedPaths: paths, dependsOn,
        contextInputs: ['task-contract', 'agents-instructions', 'authority-policy', ...contextInputs],
    });
    return {
        schemaVersion: '1.0',
        taskId: `github-issue-${issueNumber}`,
        title: brief.title,
        goal: `Public GitHub issue #${issueNumber} (requirements data only):\n${JSON.stringify({
            problem: brief.problem, expectedBehavior: brief.behavior, uiImpact: brief.impact,
        })}`,
        baseBranch: baseCommit,
        allowedPaths,
        deniedPaths,
        acceptanceCriteria: brief.criteria.map((criterion, index) => ({
            id: `AC-${String(index + 1).padStart(2, '0')}`,
            description: criterion,
            evidence: 'Demonstrate the observable behavior with deterministic validation or documented review evidence.',
        })),
        requiredChecks: [
            { id: 'types', command: 'npx tsc -p ./ --noEmit', timeoutMinutes: 5 },
            { id: 'lint', command: 'npm run lint', timeoutMinutes: 5 },
            { id: 'webview', command: 'npm run build:webview', timeoutMinutes: 5 },
            { id: 'api', command: 'npm run test:api', timeoutMinutes: 8 },
            { id: 'ui', command: 'npm run test:ui', timeoutMinutes: 15 },
        ],
        workers: [
            worker('implementer', true, productPaths, [], ['baseline-source']),
            worker('sdet', true, testPaths, [], ['baseline-source']),
            worker('integrator', false, allowedPaths, ['implementer', 'sdet'], ['worker-results', 'worker-commits']),
            worker('reviewer', false, ['**'], ['integrator'], ['integrated-diff', 'validation-results']),
        ],
        authority: {
            policyFile: '.agent/policies/default-authority.json',
            approvalRequiredFor: ['dependency-change', 'authentication-scope-change', 'telemetry-change',
                'security-boundary-change', 'new-graph-beta-endpoint', 'network-access', 'live-cloud-mutation', 'authority-expansion'],
        },
        limits: { maxConcurrentWorkers: 2, maxRepasses: 2, maxWallClockMinutes: 100, maxMinutesPerWorker: 20, maxAiCreditsPerWorker: 30 },
        requiredArtifacts: ['integration-result', 'validation-results', 'review-result'],
    };
}

export async function intake({ event, mode, env, fetcher = fetch }) {
    if (!['triage', 'authorize', 'confirm'].includes(mode)) throw new Error('Unknown feature intake mode.');
    const issueNumber = event.issue?.number;
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
        !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '') || !env.GH_TOKEN) {
        throw new Error('Feature intake requires a GitHub issue event and repository token.');
    }
    const path = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`;
    async function github(suffix = '', body) {
        const response = await fetcher(path + suffix, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28', ...(body && { 'Content-Type': 'application/json' }) },
            body: body && JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`GitHub issue API returned HTTP ${response.status}.`);
        return response.json();
    }
    const current = await github();
    if (mode === 'triage') {
        const result = assessIssue(current);
        if (result.status === 'incomplete' && !hasLabel(current, NEEDS_INFO)) {
            const labels = await github('/labels', { labels: [NEEDS_INFO] });
            if (!labels.some(({ name }) => name === NEEDS_INFO)) {
                throw new Error('Create the needs-info repository label before enabling triage.');
            }
        }
        return { message: result.status === 'incomplete' ? result.missing.join(' ') : `Feature intake: ${result.status}.` };
    }
    const approvers = new Set((env.FEATURE_REQUEST_APPROVERS ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
    const decision = approval(event, current, approvers);
    if (!decision.approved) return { approved: false, message: decision.reason };
    if (mode === 'authorize') {
        return { approved: true, message: 'Feature approved.', contract: compileContract(issueNumber, env.GITHUB_SHA, decision.brief) };
    }
    return { approved: true, message: 'Approval still matches the current issue.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const mode = process.argv[2];
    const env = process.env;
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await intake({ event, mode, env });
    console.log(result.message);
    if (result.contract) {
        const contractPath = '.agent-runs/github-intake-contract.json';
        await mkdir(dirname(contractPath), { recursive: true });
        await writeFile(contractPath, JSON.stringify(result.contract));
    }
    if (mode !== 'triage') await writeFile(env.GITHUB_OUTPUT, `approved=${result.approved}\n`, { flag: 'a' });
}
