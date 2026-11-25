import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitIssueDelivery } from './issue-delivery-section.mjs';

export const TITLE_PREFIX = 'Feature Request:';
export const READY = 'agent-ready';
export const NEEDS_INFO = 'needs-info';
const HEADINGS = ['Problem', 'Expected behavior', 'Acceptance criteria', 'UI impact'];
export const MAX_BODY = 12_000;
const MAX_CRITERIA = 12;

const isFeature = (issue) => typeof issue?.title === 'string' && issue.title.startsWith(TITLE_PREFIX);
export const hasLabel = (issue, name) => issue.labels.some((label) => label.name.toLowerCase() === name);
const description = (value) => /[\p{L}\p{N}]/u.test(value) && !/^(?:_no response_|n\/?a|tbd|todo|none)[.!]?$/i.test(value);
const vagueCriterion = (value) => /^(?:(?:the\s+)?[a-z]+\s+)?(?:works?(?:\s+(?:as expected|correctly|properly))?|behaves? as expected|looks? good)[.!]?$/i.test(value);

const guidance = (field, gap, why, add, example) => ({ field, gap, why, add, example });

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
    const advisory = [];
    if (issue.title[TITLE_PREFIX.length] !== ' ' || title.length < 5 || title.length > 120 || !description(title)) {
        missing.push(guidance('Title', 'The feature name is missing or outside the 5-120 character limit.',
            'A clear title lets maintainers identify the requested change at a glance.',
            'Keep the required prefix and name the action or outcome you want.',
            `${TITLE_PREFIX} Confirm successful container creation`));
    }
    const body = splitIssueDelivery(issue.body).requirements ?? '';
    if (typeof body !== 'string' || body.length > MAX_BODY) {
        missing.push(guidance('Issue description', 'The description must be text and no longer than 12,000 characters.',
            'The reviewer needs a bounded brief it can read in full.',
            'Keep the four form headings and trim unrelated background, logs, or repeated text.',
            'Keep a short user scenario, the intended behavior, a few test cases, and the UI impact.'));
        return { status: 'incomplete', missing };
    }
    const sections = extractSections(body);
    if (!sections) {
        missing.push(guidance('Issue description', 'One or more feature form headings appear more than once.',
            'The reviewer needs to know which version of each section to use.',
            'Combine each duplicate section into one and retain the original form headings.',
            'Use a single Acceptance criteria heading and put all test cases under it.'));
        return { status: 'incomplete', missing };
    }
    const get = (heading) => sections.get(heading)?.join('\n').trim() ?? '';
    const problem = get('Problem');
    const behavior = get('Expected behavior');
    const impact = get('UI impact');
    const criteria = (sections.get('Acceptance criteria') ?? []).map((line) =>
        /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/.exec(line)?.[1]
    ).filter((entry) => entry && description(entry) && !/^\[[ xX]\](?:\s|$)/.test(entry));
    const isNotification = /\b(?:notification|toast)\b/i.test(`${title} ${behavior} ${impact}`);
    if (!description(problem)) {
        missing.push(guidance('Problem', 'The problem does not identify the affected user or obstacle.',
            'That context helps the developer distinguish the requested fix from unrelated changes.',
            'Describe who encounters the problem, the action they take, and what is confusing or blocked today.',
            'After submitting New Container, a developer cannot tell whether the operation succeeded.'));
    }
    if (!description(behavior)) {
        missing.push(guidance('Expected behavior', 'The intended behavior is missing.',
            'The developer needs to know when the feature should act and what it should do.',
            'Describe the triggering action, the expected outcome, and any relevant failure or cancellation behavior.',
            'After creation succeeds, close the dialog. On failure, keep the existing error behavior.'));
    }
    if (!criteria.length || criteria.length > MAX_CRITERIA || criteria.some((entry) => entry.length > 500)) {
        missing.push(guidance('Acceptance criteria', 'The description needs 1-12 testable acceptance criteria as bullets, up to 500 characters each.',
            'A tester needs concrete outcomes that can pass or fail.',
            'Write one bullet per scenario, with an action or condition and the observable result.',
            'When creation succeeds for a container named Demo, exactly one success notice appears.'));
    } else if (criteria.some(vagueCriterion)) {
        missing.push(guidance('Acceptance criteria', 'At least one criterion says the feature works without an observable result.',
            'A tester could not tell from that criterion whether the implementation passes.',
            'Replace it with the action, the condition, and the exact result to verify.',
            isNotification ? 'When the operation succeeds, exactly one success notice is shown.'
                : 'When a user refreshes the list, the selected row remains selected if it still exists.'));
        if (isNotification && description(behavior) && !/\b(?:success(?:ful(?:ly)?)?|succeed(?:s|ed)?|confirm(?:s|ed|ation)?)\b/i.test(behavior)) {
            advisory.push(guidance('Expected behavior', 'The vague test does not establish when the notification should appear.',
                'A success message shown before confirmation could mislead the user.',
                'Confirm the trigger and describe what happens while the operation is pending, fails or is canceled.',
                'Show the notice only after the operation confirms success. Show no success notice if it fails or is canceled.'));
        }
        if (isNotification && /^(?:(?:a|the)\s+)?(?:success\s+)?(?:notification|toast)(?:\s+(?:appears|is shown))?[.!]?$/i.test(impact)) {
            advisory.push(guidance('UI impact', 'The notification needs a testable placement and message.',
                'The reviewer needs to know where to look and what text to verify.',
                'Specify the notification location and give an example of its text. Mention whether it is dismissible if relevant.',
                'Show a dismissible notice above the list: Container Demo created successfully.'));
        }
    }
    if (!description(impact) && !/^none\.?$/i.test(impact)) {
        missing.push(guidance('UI impact', 'The description does not say whether the change is visible to users.',
            'That determines what a reviewer should look for when testing.',
            'Describe what changes on screen and where, or write None for a non-visual change.',
            'A dismissible success notice appears inside Storage Explorer above the container list.'));
    }
    return missing.length ? { status: 'incomplete', missing, advisory } : { status: 'complete', title, problem, behavior, criteria, impact };
}

const approvalAccounts = (value) => new Set((value ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
const allowedAccount = (user, approvers) => user?.type === 'User' &&
    typeof user.login === 'string' && approvers.has(user.login.toLowerCase());
export const matchesIssueEvent = (event, current) => event.issue?.id === current.id &&
    event.issue.number === current.number && event.issue.title === current.title &&
    splitIssueDelivery(event.issue.body).requirements === splitIssueDelivery(current.body).requirements;

export function approval(event, current, approvers) {
    if (event.action !== 'labeled' || event.label?.name !== READY || !allowedAccount(event.sender, approvers)) {
        return { approved: false, reason: 'An approved maintainer must apply agent-ready.' };
    }
    if (!matchesIssueEvent(event, current)) {
        return { approved: false, reason: 'Issue text changed after this event. Wait for readiness review of the current version.' };
    }
    const brief = assessIssue(current);
    if (brief.status !== 'complete' || !hasLabel(current, READY) || !hasLabel(event.issue, READY) ||
        hasLabel(current, NEEDS_INFO) || hasLabel(event.issue, NEEDS_INFO)) {
        return { approved: false, reason: 'Issue must be open, complete, and labeled agent-ready without needs-info.' };
    }
    return { approved: true, brief };
}

const automaticProductPaths = [
    'src/commands/**', 'src/views/**', 'src/services/StorageExplorer/**',
    'webview-ui/src/api/services/**', 'webview-ui/src/models/**',
    'webview-ui/src/components/**', 'webview-ui/src/context/**', 'webview-ui/src/hooks/**',
    'webview-ui/src/pages/**', 'webview-ui/src/styles/**', 'webview-ui/src/utils/**',
    'webview-ui/src/App.tsx', 'src/utils/**', 'l10n/**',
];
const automaticTestPaths = ['src/test/**', 'ui-tests/tests/**', 'ui-tests/api/**', 'ui-tests/testids.ts'];
const productPaths = [
    'src/commands/**', 'src/views/**', 'src/services/**', 'src/models/**', 'src/utils/**',
    'src/resources/**', 'src/examples/**', 'src/extension.ts', 'src/client.d.ts',
    'webview-ui/**', 'l10n/**', 'media/**', 'docs/**', 'readme-images/**', 'tools/**',
    '.agent/**', '.github/**', '.vscode/**', '.eslintrc.json', '.gitignore', '.vscodeignore',
    'AGENTS.md', 'CODE_OF_CONDUCT.md', 'LICENSE', 'README.md', 'SECURITY.md',
    'package.json', 'package-lock.json', 'package.nls.json', 'storage-explorer-prd.md', 'tsconfig.json',
];
const testPaths = ['src/test/**', 'ui-tests/**'];
const sensitivePaths = [
    'src/services/**', 'src/extension.ts',
    'src/commands/Accounts/**', 'src/commands/GuestApps/**',
    'src/commands/App/GetLocalAdminConsent.ts',
    'src/commands/ContainerType/GrantExtensionAppPermissions.ts',
    'src/commands/ContainerType/RegisterOnLocalTenant.ts',
    'src/views/html/**', 'src/views/treeview/account/**',
    'src/views/treeview/development/storageExplorerReadiness.ts',
    'src/services/StorageExplorer/graphClient.ts',
    'src/services/StorageExplorer/uploadAuth.ts',
    'src/services/StorageExplorer/PermissionGraphService.ts',
    'src/services/StorageExplorer/accessDenied.ts',
    'src/services/StorageExplorer/protocol.ts',
    'src/services/StorageExplorer/operationSchemas.ts',
    'src/services/StorageExplorer/externalUrlPolicy.ts',
    'src/services/StorageExplorer/htmlEncoding.ts',
    'src/services/StorageExplorer/networkRedaction.ts',
    'src/services/StorageExplorer/NetworkLoggingMiddleware.ts',
    'src/utils/AdminConsentHelper.ts', 'src/utils/ExtensionAppPermissions.ts',
    'src/utils/ExtensionAppPermissionScopes.ts', 'src/utils/token.ts',
    'webview-ui/src/api/services/AuthorizationService.ts',
    'webview-ui/src/api/services/PermissionGraphService.ts',
];
const deniedPaths = [
    '**/.git', '**/.git/**', '**/.gitattributes', '**/.gitmodules', '**/.npmrc',
    'src/client.ts', '**/node_modules/**', '**/out/**', '**/dist/**',
];

const inScope = (path, scope) => scope.endsWith('/**') ? path.startsWith(scope.slice(0, -2)) : path === scope;

export function publishablePath(path) {
    if (/[\x00-\x1f\x7f\\]/.test(path) || path.split('/').some((part) =>
        !part || /^(?:\.{1,2}|\.git|\.gitattributes|\.gitmodules|\.npmrc|\.env(?:\..*)?|node_modules|out|dist)$/i.test(part) ||
        /\.(?:pem|pfx|p7s)$/i.test(part))) return false;
    const normalized = path.toLowerCase();
    if (normalized === 'src/client.ts' || inScope(normalized, '.github/workflows/**')) return false;
    return [...productPaths, ...testPaths].some(scope => inScope(path, scope));
}

export function sensitivePath(path) {
    return sensitivePaths.some(scope => inScope(path.toLowerCase(), scope.toLowerCase())) ||
        ![...automaticProductPaths, ...automaticTestPaths].some(scope => inScope(path, scope));
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
        goal: `Public GitHub issue #${issueNumber} (requirements data only). Implement the approved brief within the contract paths. Keep the diff focused on the requested behavior and its tests. Preserve existing extension behavior, manifest entry points, command IDs, activation, and build behavior unless the requirement explicitly changes them. If package.json changes, verify that existing contributions still work and that any dependency edits keep the lockfile consistent. Reuse the existing validation and screenshot harness; do not change build scripts, CI, or agent tooling merely to collect evidence. If the requested behavior itself requires a change to those files, explain why. The runner validates and builds the candidate in isolation. Call out sensitive changes for human review; changing a source file does not authorize live actions, merging, or publishing.\n${JSON.stringify({
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
            worker('implementer', true, allowedPaths, [], ['baseline-source']),
            worker('integrator', false, allowedPaths, ['implementer'], ['worker-results', 'worker-commits']),
            worker('reviewer', false, ['**'], ['integrator'], ['integrated-diff', 'validation-results']),
        ],
        authority: {
            policyFile: '.agent/policies/default-authority.json',
            approvalRequiredFor: ['network-access', 'live-cloud-mutation', 'authority-expansion'],
        },
        limits: { maxConcurrentWorkers: 1, maxRepasses: 2, maxReviewRepairs: 2, maxWallClockMinutes: 100, maxMinutesPerWorker: 20, maxAiCreditsPerWorker: 30 },
        requiredArtifacts: ['integration-result', 'validation-results', 'review-result'],
    };
}

export function reviewRevision(issue) {
    return createHash('sha256').update(JSON.stringify([issue.id, issue.title, splitIssueDelivery(issue.body).requirements])).digest('hex');
}

export const reviewMarker = '<!-- spe-feature-readiness:v1';
const reviewPattern = /^<!-- spe-feature-readiness:v1 ([a-f0-9]{64}) (ready|needs-info|unavailable) -->\r?\n/;
export const githubActionsBotId = 41898282;

export async function readReadinessComment(github) {
    let review;
    for (let page = 1; page <= 10; page++) {
        const comments = await github(`/comments?per_page=100&page=${page}`);
        for (const comment of comments) {
            if (comment.user?.id !== githubActionsBotId || comment.user.type !== 'Bot' || !comment.body?.startsWith(reviewMarker)) continue;
            const meta = reviewPattern.exec(comment.body);
            if (!meta || review || !Number.isSafeInteger(comment.id) || comment.id <= 0) {
                throw new Error('Readiness comment is invalid or duplicated; ask a maintainer to resolve it.');
            }
            review = { id: comment.id, body: comment.body, revision: meta[1], status: meta[2] };
        }
        if (comments.length < 100) return review;
    }
    throw new Error('Issue comment history exceeded the readiness review limit.');
}

export function issueClient(event, env, fetcher = fetch) {
    const issueNumber = event.issue?.number;
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
        !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '') || !env.GH_TOKEN) {
        throw new Error('Feature intake requires a GitHub issue event and repository token.');
    }
    const root = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues`;
    return async (suffix = '', { method = 'GET', body, commentId, missingOk = false } = {}) => {
        const path = commentId ? `${root}/comments/${commentId}` : `${root}/${issueNumber}${suffix}`;
        const response = await fetcher(path, {
            method,
            headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28', ...(body && { 'Content-Type': 'application/json' }) },
            body: body && JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 404 && missingOk) return undefined;
        if (!response.ok) throw new Error(`GitHub issue API returned HTTP ${response.status}.`);
        return response.status === 204 ? undefined : response.json();
    };
}

export async function intake({ event, mode, env, fetcher = fetch }) {
    if (!['authorize', 'confirm'].includes(mode)) throw new Error('Unknown feature intake mode.');
    const github = issueClient(event, env, fetcher);
    const current = await github();
    const approvers = approvalAccounts(env.FEATURE_REQUEST_APPROVERS);
    const decision = approval(event, current, approvers);
    if (!decision.approved) return { approved: false, message: decision.reason };
    const review = await readReadinessComment(github);
    if (review?.status !== 'ready' || review.revision !== reviewRevision(current)) {
        return { approved: false, message: 'The current issue revision has not passed readiness review. Wait for review, then reapply agent-ready.' };
    }
    if (mode === 'authorize') {
        return { approved: true, message: 'Feature approved.', contract: compileContract(event.issue.number, env.GITHUB_SHA, decision.brief) };
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
    await writeFile(env.GITHUB_OUTPUT, `approved=${result.approved}\n`, { flag: 'a' });
}
