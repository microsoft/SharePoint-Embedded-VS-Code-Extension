import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { reviewMarker, reviewRevision, TITLE_PREFIX } from './feature-issue.mjs';
import { publish, TransientGitTransportError, validateStagedDiff } from './publish-feature.mjs';
import { classifyFeatureHandoff, updateFeatureHandoff, watchFeatureRun } from './feature-handoff.mjs';
import { appendIssueDelivery, splitIssueDelivery } from './issue-delivery-section.mjs';
import { requireTestClientId, verifyBundledClientId } from './package-feature.mjs';

test('test VSIX packaging requires a configured non-nil client ID in the shipped extension bundle', () => {
    const nil = '00000000-0000-0000-0000-000000000000';
    const testId = 'a1234567-89ab-4def-8123-456789abcdef';
    for (const invalid of [undefined, '', '   ', nil, 'not-an-id']) {
        assert.throws(() => requireTestClientId(invalid), /SPE_TEST_CLIENT_ID/);
    }
    assert.equal(requireTestClientId(` ${testId.toUpperCase()} `), testId);
    assert.throws(() => verifyBundledClientId(`const authId="${nil}";`, testId), /entrypoint/);
    assert.doesNotThrow(() => verifyBundledClientId(`const authId="${testId}",unrelated="${nil}";`, testId));
});

const repository = 'owner/repo';
const branchCommit = '1'.repeat(40);
function branchApi(path, { tip = branchCommit, changed = true } = {}) {
    if (path === `/repos/${repository}/git/ref/heads/feature-agent/issue-8`) return Response.json({ object: { sha: tip } });
    if (path === `/repos/${repository}/compare/main...${branchCommit}`) {
        return Response.json({ ahead_by: changed ? 1 : 0, files: changed ? [{ filename: 'src/example.ts' }] : [] });
    }
}
const issue = {
    id: 100, number: 8, labels: [{ name: 'agent-ready' }], state: 'open',
    title: `${TITLE_PREFIX} Improve the prompt`,
    body: '### Problem\nUnclear prompt.\n### Expected behavior\nDescribe next steps.\n' +
        '### Acceptance criteria\n- The prompt describes next steps.\n### UI impact\nNew prompt text.',
};
const event = {
    action: 'labeled', label: { name: 'agent-ready' }, sender: { type: 'User', login: 'maintainer' }, issue,
    repository: { full_name: repository, default_branch: 'main' },
};

test('publication independently rejects forbidden paths and non-regular file modes', () => {
    const record = (file, mode = '100644') => `:100644 ${mode} aaaaaaa bbbbbbb M\0${file}\0`;
    assert.doesNotThrow(() => validateStagedDiff(record('webview-ui/src/components/example.tsx')));
    assert.doesNotThrow(() => validateStagedDiff(record('package.json') + record('tools/agent-loop/example.mjs', '100755')));
    for (const raw of [
        '', record('untracked-root.txt'), record('.github/.git/config'),
        record('src/client.ts'), record('webview-ui/dist/generated.js'),
        record('src/utils/.env'), record('src/utils/example.ts', '120000'),
        record('src/utils/../extension.ts'),
    ]) assert.throws(() => validateStagedDiff(raw));
});

test('flagging sensitive changes is independent of delivering the reviewed patch and VSIX', () => {
    const row = (path, mode = '100644') => `:100644 ${mode} aaaaaaa bbbbbbb M\0${path}\0`;
    const ordinary = row('webview-ui/src/components/example.tsx');
    const workflow = '.github/workflows/validate.yml';
    const manifest = 'package.json';
    assert.deepEqual(classifyFeatureHandoff(ordinary), { reviewPaths: [] });
    const auth = 'src/services/Auth/GraphAuthProvider.ts';
    assert.deepEqual(classifyFeatureHandoff(ordinary + row(auth)), { reviewPaths: [auth] });
    assert.deepEqual(classifyFeatureHandoff(ordinary + row(workflow) + row(manifest)),
        { reviewPaths: [workflow, manifest] });
    assert.deepEqual(classifyFeatureHandoff(row('src/utils/example.ts', '100755')),
        { reviewPaths: ['src/utils/example.ts'] });
    assert.throws(() => classifyFeatureHandoff(row('src/utils/example.ts', '120000')));
});

test('the issue description reports the branch and direct downloads without changing readiness', async () => {
    let current = { ...issue };
    const methods = [];
    const env = {
        GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '42', GH_TOKEN: 'mock',
        FEATURE_REQUEST_APPROVERS: 'maintainer', PATCH_ARTIFACT_ID: '122', VSIX_ARTIFACT_ID: '123',
        REVIEW_FILES: '["src/services/Auth/GraphAuthProvider.ts"]', BRANCH_PUSHED: 'true',
        PR_POLICY_BLOCKED: 'true', IMPLEMENT_APPROVED: 'true', IMPLEMENT_RESULT: 'success', BRANCH_COMMIT: branchCommit,
        OMIT_PREVIEW: 'true', OPTIONAL_HARDENING: 'true', UX_SCREENSHOT_COMMIT: 'c'.repeat(40),
    };
    const fetcher = async (url, init) => {
        const branchResponse = branchApi(new URL(url).pathname);
        if (branchResponse) return branchResponse;
        assert.equal(new URL(url).pathname, '/repos/owner/repo/issues/8');
        if (init.method === 'GET') return Response.json(current);
        methods.push(init.method);
        const { body, labels } = JSON.parse(init.body);
        current = { ...current, body, labels: labels ? labels.map(name => ({ name })) : current.labels };
        return Response.json(current);
    };
    await updateFeatureHandoff(event, env, fetcher);
    await updateFeatureHandoff(event, env, fetcher);
    assert.deepEqual(methods, ['PATCH']);
    assert.equal(splitIssueDelivery(current.body).requirements, issue.body);
    assert.equal(reviewRevision(current), reviewRevision(issue));
    for (const [label, artifactId] of [['the testable VSIX and checksum', 123], ['the reviewed patch', 122]]) {
        const link = current.body.match(new RegExp(`\\[Download ${label}\\]\\(([^)]+)\\)`))?.[1];
        const url = new URL(link);
        assert.equal(url.origin, 'https://github.com');
        assert.equal(url.pathname, `/owner/repo/actions/runs/42/artifacts/${artifactId}`);
    }
    assert.match(current.body, /Branch pushed:.*feature-agent\/issue-8/);
    assert.match(current.body, /\[View code changes\]\(https:\/\/github\.com\/owner\/repo\/compare\/main\.\.\.feature-agent\/issue-8\)/);
    assert.match(current.body, /GitHub policy blocked automatic draft PR creation/);
    assert.match(current.body, /\[Open a PR manually\]/);
    assert.doesNotMatch(current.body, /Playwright UX screenshot/);
    assert.match(current.body, /optional screenshot was omitted/);
    assert.match(current.body, /additional defensive handling was suggested/);
    assert.match(current.body, /Ready for human review/);
    assert.match(current.body, /GraphAuthProvider\.ts/);
    const screenshotCommit = 'a'.repeat(40);
    current.labels = [{ name: 'agent-ready' }];
    await updateFeatureHandoff(event, { ...env, GITHUB_RUN_ID: '43', DRAFT_PR_NUMBER: '19', UX_SCREENSHOT_COMMIT: screenshotCommit, OMIT_PREVIEW: 'false' }, fetcher);
    assert.deepEqual(methods, ['PATCH', 'PATCH']);
    assert.ok(current.body.includes(`Draft PR: [#19](https://github.com/owner/repo/pull/19).\n\n` +
        `![Playwright UX screenshot](https://raw.githubusercontent.com/owner/repo/${screenshotCommit}/ux-preview.png)`));
    assert.equal(current.body.match(/^## Feature agent delivery$/gm).length, 1);
    await assert.rejects(updateFeatureHandoff(event, env, fetcher), /cannot claim delivery/);
    assert.equal(splitIssueDelivery(current.body).runId, '43');
    current.body = current.body.replace('Unclear prompt.', 'Updated problem.');
    await assert.rejects(updateFeatureHandoff(event, { ...env, GITHUB_RUN_ID: '44' }, fetcher), /cannot claim delivery/);
    assert.deepEqual(methods, ['PATCH', 'PATCH']);
    assert.match(current.body, /Updated problem\./);
});

test('delivery parsing does not discard author text after the managed section', () => {
    const requirements = `${issue.body}\n`;
    const body = appendIssueDelivery(requirements, '42', '## Feature agent delivery\n\nA run link.');
    assert.equal(splitIssueDelivery(body).requirements, requirements);
    const edited = `${body}\n\nNew author text.`;
    assert.equal(splitIssueDelivery(edited).requirements, `${requirements}\n\nNew author text.`);
});

test('approved retries switch between agent-ready and ready-for-human-review', async () => {
    const label = 'ready-for-human-review';
    const priorLabels = [...issue.labels, { name: 'enhancement' }];
    const deliveredLabels = [{ name: 'enhancement' }, { name: label }];
    let current = {
        ...issue,
        labels: [...priorLabels, { name: label }],
        body: appendIssueDelivery(issue.body, '41', '## Feature agent delivery\n\nPrevious run.'),
    };
    const env = {
        GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '42', GH_TOKEN: 'mock',
        FEATURE_REQUEST_APPROVERS: 'maintainer', IMPLEMENT_RESULT: 'success', IMPLEMENT_APPROVED: 'true', BRANCH_COMMIT: branchCommit,
        PATCH_ARTIFACT_ID: '507', VSIX_ARTIFACT_ID: '508',
    };
    const review = { id: 1, user: { id: 41898282, type: 'Bot' }, body: `${reviewMarker} ${reviewRevision(issue)} ready -->\nReady.` };
    const labelWrites = [];
    const remoteState = { tip: branchCommit, changed: true };
    const fetcher = async (target, init) => {
        const path = decodeURIComponent(new URL(target).pathname);
        const branchResponse = branchApi(path, remoteState);
        if (branchResponse) return branchResponse;
        if (path.includes('/actions/')) return Response.json({ jobs: [{ name: 'implement', status: 'completed' }] });
        if (path.endsWith('/comments')) return Response.json([review]);
        if (init.method === 'DELETE') {
            assert.equal(path, `/repos/${repository}/issues/8/labels/${label}`);
            current.labels = current.labels.filter(({ name }) => name !== label);
            labelWrites.push('removed');
            return new Response(null, { status: 204 });
        }
        if (init.method === 'PATCH') {
            const { body, labels } = JSON.parse(init.body);
            current = { ...current, body };
            if (labels) {
                assert.deepEqual(labels, deliveredLabels.map(({ name }) => name));
                current.labels = labels.map(name => ({ name }));
                labelWrites.push('switched');
            }
        }
        return Response.json(current);
    };
    const watch = (runEnv, runEvent = event) => watchFeatureRun(runEvent, runEnv, fetcher, async () => {});
    const report = (runEnv, overrides) => updateFeatureHandoff(event, { ...runEnv, ...overrides }, fetcher);

    await watch(env, { ...event, sender: { type: 'User', login: 'other-user' } });
    assert.deepEqual(labelWrites, []);
    await watch(env);
    assert.deepEqual(current.labels, priorLabels);
    await assert.rejects(report(env, {}), /No feature branch was confirmed/);
    await assert.rejects(report(env, { VSIX_ARTIFACT_ID: '' }), /not delivered/);
    await assert.rejects(report(env, { PATCH_ARTIFACT_ID: '' }), /not delivered/);
    remoteState.tip = '2'.repeat(40);
    await assert.rejects(report(env, { BRANCH_PUSHED: 'true' }), /no longer points to the reviewed commit/);
    remoteState.tip = branchCommit;
    remoteState.changed = false;
    await assert.rejects(report(env, { BRANCH_PUSHED: 'true' }), /no PR diff/);
    remoteState.changed = true;
    assert.deepEqual(labelWrites, ['removed']);
    assert.doesNotMatch(current.body, /Ready for human review/);

    const retry = { ...env, GITHUB_RUN_ID: '43' };
    await watch(retry);
    await assert.rejects(report(env, { BRANCH_PUSHED: 'true' }), /cannot claim delivery/);
    assert.deepEqual(current.labels, priorLabels);
    const policyBlocked = { PR_POLICY_BLOCKED: 'true', BRANCH_PUSHED: 'true', UX_SCREENSHOT_COMMIT: 'b'.repeat(40) };
    await report(retry, policyBlocked);
    await report(retry, policyBlocked);
    assert.deepEqual(current.labels, deliveredLabels);
    assert.match(current.body, /Ready for human review/);
    assert.match(current.body, /\[Open a PR manually\]\([^\n]+\)\.\n\n!\[Playwright UX screenshot\]/);
    assert.deepEqual(labelWrites, ['removed', 'switched']);

    const manualOnly = { ...retry, GITHUB_RUN_ID: '44' };
    current.labels = [...current.labels, { name: 'agent-ready' }];
    await watch(manualOnly);
    assert.deepEqual(current.labels.map(({ name }) => name).sort(), ['agent-ready', 'enhancement']);
    await report(manualOnly, { BRANCH_PUSHED: 'true' });
    assert.deepEqual(current.labels, deliveredLabels);
    assert.match(current.body, /\[Open a PR manually\]/);
    assert.deepEqual(labelWrites, ['removed', 'switched', 'removed', 'switched']);
    const cancelled = { ...retry, GITHUB_RUN_ID: '45' };
    current.labels = [...current.labels, { name: 'agent-ready' }];
    await watch(cancelled);
    await report(cancelled, { IMPLEMENT_RESULT: 'cancelled' });
    assert.deepEqual(current.labels.map(({ name }) => name).sort(), ['agent-ready', 'enhancement']);
    assert.match(current.body, /Run cancelled/);
});

test('a fresh approved run reports pickup, progress, and failure on the same issue', async () => {
    let current = { ...issue, body: appendIssueDelivery(issue.body, '41', '## Feature agent delivery\n\nPrevious run.') };
    const writes = [];
    const env = {
        GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '42', GH_TOKEN: 'mock',
        FEATURE_REQUEST_APPROVERS: 'maintainer',
    };
    const executing = 'Run the agent loop and export the reviewed diff';
    const packaging = 'Package a testable VSIX from the reviewed commit';
    const statuses = [
        { status: 'queued', steps: [] },
        { status: 'in_progress', steps: [{ name: executing, status: 'in_progress' }] },
        { status: 'in_progress', steps: [{ name: packaging, status: 'in_progress' }] },
        { status: 'completed', steps: [{ name: packaging, conclusion: 'failure' }] },
    ];
    let poll = 0;
    const fetcher = async (url, init) => {
        const endpoint = new URL(url).pathname;
        if (endpoint.endsWith('/attempts/1/jobs')) return Response.json({
            jobs: [{ name: 'implement', ...statuses[Math.min(poll++, statuses.length - 1)] }],
        });
        if (endpoint.endsWith('/comments')) return Response.json([{
            id: 1, user: { id: 41898282, type: 'Bot' },
            body: `${reviewMarker} ${reviewRevision(issue)} ready -->\nReady.`,
        }]);
        if (init.method === 'PATCH') {
            current = { ...current, ...JSON.parse(init.body) };
            writes.push(current.body);
        }
        return Response.json(current);
    };
    const rejected = { ...event, sender: { type: 'User', login: 'other-user' } };
    await watchFeatureRun(rejected, env, fetcher, async () => {});
    await updateFeatureHandoff(rejected, { ...env, IMPLEMENT_RESULT: 'success' }, fetcher);
    assert.equal(writes.length, 0);
    await watchFeatureRun(event, env, fetcher, async () => {});
    assert.equal(writes.length, 3);
    assert.match(writes[0], /Picked up.*Waiting for an implementation runner/);
    assert.match(writes[1], /Implementing, testing, and reviewing the change/);
    assert.match(writes[2], /Building the testable VSIX/);
    await updateFeatureHandoff(event, { ...env, IMPLEMENT_RESULT: 'failure', IMPLEMENT_APPROVED: 'true', PATCH_ARTIFACT_ID: '507' }, fetcher);
    assert.equal(writes.length, 4);
    assert.match(current.body, /Implementation failed/);
    assert.match(current.body, /Stopped at: \*\*Building the testable VSIX\*\*/);
    assert.match(current.body, /No testable VSIX was delivered/);
    assert.match(current.body, /\[Download the reviewed patch\]/);
    await updateFeatureHandoff(event, { ...env, IMPLEMENT_RESULT: 'failure', WORKER_RETRIES: '2' }, fetcher);
    assert.match(current.body, /Run blocked after automatic recovery/);
    assert.match(current.body, /retried workers 2 times automatically/);
    const approvalReason = 'Feature agent stopped during implementation: Test worker (AC-01) requested approval: network-access. No additional permission was granted. Use a recorded fixture or mock instead of contacting the service.';
    await updateFeatureHandoff(event, { ...env, IMPLEMENT_RESULT: 'failure', AGENT_DIAGNOSTIC: approvalReason, WORKER_RETRIES: '1', OFFLINE_PLANS: '1' }, fetcher);
    assert.match(current.body, /Needs a maintainer decision/);
    assert.ok(current.body.includes(`**Reason:** ${approvalReason}`));
    assert.match(current.body, /Automatic worker retries:\*\* 1/);
    assert.match(current.body, /Offline alternatives attempted without additional permissions: 1/);
    assert.equal(splitIssueDelivery(current.body).runId, '42');
    assert.equal(reviewRevision(current), reviewRevision(issue));
    current.body = current.body.replace('Unclear prompt.', 'Updated problem.');
    await assert.rejects(updateFeatureHandoff(event, { ...env, IMPLEMENT_APPROVED: 'true', IMPLEMENT_RESULT: 'success', PATCH_ARTIFACT_ID: '507', VSIX_ARTIFACT_ID: '508' }, fetcher), /cannot claim delivery/);
    assert.match(current.body, /Run no longer applies to this issue/);
    assert.match(current.body, /Updated problem\./);
    assert.doesNotMatch(current.body, /Download the testable VSIX/);
});

test('publishes from an isolated index, replaces the issue branch, and reuses an open PR', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'spe-publish-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const repositoryPath = join(directory, 'repo');
    const authPath = 'src/services/Auth/GraphAuthProvider.ts';
    await mkdir(join(repositoryPath, 'src', 'services', 'Auth'), { recursive: true });
    const git = (args, env, input) => execFileSync('git', ['-C', repositoryPath, ...args], {
        env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const file = join(repositoryPath, authPath);
    const manifest = join(repositoryPath, 'package.json');
    await writeFile(file, 'export const prompt = "Old";\n');
    await writeFile(manifest, '{}\n');
    git(['init', '-q']);
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Base']);
    const base = git(['rev-parse', 'HEAD']).trim();
    function snapshotTree() {
        git(['add', '-u']);
        const tree = git(['write-tree']).trim();
        git(['restore', '--staged', '--', '.']);
        return tree;
    }
    await writeFile(file, 'export const prompt = "New";\n');
    const reviewedTree = snapshotTree();
    await writeFile(join(directory, 'feature.patch'), git(['diff', '--binary']));
    await writeFile(join(directory, 'feature-base-sha.txt'), `${base}\n`);
    git(['restore', authPath]);
    const env = {
        ...process.env, GH_TOKEN: 'mock', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: base, GITHUB_RUN_ID: '42', RUNNER_TEMP: directory, FEATURE_REQUEST_APPROVERS: 'maintainer',
        REVIEWED_TREE: reviewedTree,
        TESTABLE_VSIX_URL: `https://github.com/${repository}/actions/runs/42/artifacts/123`,
    };
    const ref = 'refs/heads/feature-agent/issue-8';
    const url = `https://github.com/${repository}/pull/19`;
    let remote = '';
    let updateBeforePush;
    let transportFailure;
    let pushes = 0;
    let attempts = 0;
    let posts = 0;
    let pr;
    let lookupStatus = 200;
    let prResponse = { status: 403, message: 'GitHub Actions is not permitted to create or approve pull requests.' };
    let current = issue;
    const run = (command, args, options, input) => {
        assert.equal(command, 'git');
        assert.equal(args[0], '--no-pager');
        if (args[1] === 'ls-remote') return remote;
        if (args.includes('push')) {
            attempts++;
            if (transportFailure === 'before') {
                transportFailure = undefined;
                throw new TransientGitTransportError();
            }
            const lease = args.find(arg => arg.startsWith('--force-with-lease='));
            if (updateBeforePush) remote = updateBeforePush;
            if (lease !== `--force-with-lease=${ref}:${remote.split('\t')[0]}`) throw new Error('stale lease');
            const [head, destination] = args.at(-1).split(':');
            assert.equal(destination, ref);
            assert.equal(git(['rev-parse', `${head}^`]).trim(), base);
            remote = `${head}\t${ref}\n`;
            pushes++;
            if (transportFailure === 'after') {
                transportFailure = undefined;
                throw new TransientGitTransportError();
            }
            return '';
        }
        return git(args, options, input);
    };
    const review = { id: 1, user: { id: 41898282, type: 'Bot' }, body: `${reviewMarker} ${reviewRevision(issue)} ready -->\nReady.` };
    const fetcher = async (target, init) => {
        const request = new URL(target);
        if (request.pathname !== `/repos/${repository}/pulls`) {
            return Response.json(request.pathname.endsWith('/comments') ? [review] : current);
        }
        assert.equal(request.origin, 'https://api.github.com');
        if (init.method === 'GET') {
            assert.equal(request.searchParams.get('head'), 'owner:feature-agent/issue-8');
            return Response.json(pr ? [pr] : [], { status: lookupStatus });
        }
        assert.equal(init.method, 'POST');
        const payload = JSON.parse(init.body);
        assert.equal(payload.draft, true);
        assert.equal(payload.base, 'main');
        assert.equal(payload.head, 'feature-agent/issue-8');
        assert.match(payload.body, /Implements #8/);
        assert.match(payload.body, /\[Download the testable VSIX\]\(https:\/\/github\.com\/owner\/repo\/actions\/runs\/42\/artifacts\/123\)/);
        if (prResponse) return Response.json({ message: prResponse.message }, { status: prResponse.status });
        posts++;
        pr = { html_url: url, number: 19, head: { sha: remote.split('\t')[0] } };
        return Response.json(pr, { status: 201 });
    };
    let branchConfirmed = false;
    const options = { event, env, directory, run, onBranch: () => { branchConfirmed = true; }, fetcher };
    current = { ...issue, body: `${issue.body}\nEdited` };
    await assert.rejects(publish(options), /Issue text changed/);
    assert.equal(pushes, 0);
    current = issue;
    await assert.rejects(publish({ ...options, env: { ...env, REVIEWED_TREE: base } }), /do not match the reviewed source tree/);
    assert.equal(pushes, 0);
    assert.deepEqual(await publish(options), { policyBlocked: true });
    assert.equal(branchConfirmed, true);
    const initialCommit = remote.split('\t')[0];
    assert.match(git(['show', `${initialCommit}:${authPath}`]), /New/);
    remote = `${base}\t${ref}\n`;
    assert.deepEqual(await publish(options), { policyBlocked: true });
    assert.equal(remote, `${initialCommit}\t${ref}\n`);
    prResponse = { status: 403, message: 'Resource not accessible by integration' };
    await assert.rejects(publish(options), /failed \(HTTP 403\).*branch was pushed/);
    prResponse = { status: 422, message: 'Validation Failed' };
    await assert.rejects(publish(options), /failed \(HTTP 422\)/);
    prResponse = null;
    assert.deepEqual(await publish(options), { url, number: 19, created: true });
    await writeFile(file, 'export const prompt = "Latest";\n');
    env.REVIEWED_TREE = snapshotTree();
    await writeFile(join(directory, 'feature.patch'), git(['diff', '--binary']));
    git(['restore', authPath]);
    branchConfirmed = false;
    updateBeforePush = `${base}\t${ref}\n`;
    await assert.rejects(publish(options), /stale lease/);
    assert.equal(branchConfirmed, false);
    assert.equal(remote, updateBeforePush);
    updateBeforePush = undefined;
    assert.deepEqual(await publish(options), { url, number: 19, created: false });
    const latestCommit = remote.split('\t')[0];
    assert.match(git(['show', `${latestCommit}:${authPath}`]), /Latest/);
    assert.deepEqual(await publish(options), { url, number: 19, created: false });
    assert.equal(pushes, 3);
    assert.equal(attempts, 4);
    assert.equal(posts, 1);
    assert.equal(git(['status', '--porcelain']), '');

    await writeFile(manifest, '{"description":"Updated extension description"}\n');
    await writeFile(file, 'export const prompt = "Mixed";\n');
    env.REVIEWED_TREE = snapshotTree();
    await writeFile(join(directory, 'feature.patch'), git(['diff', '--binary']));
    git(['restore', authPath, 'package.json']);
    assert.deepEqual(await publish(options), { url, number: 19, created: false });
    const mixedCommit = remote.split('\t')[0];
    assert.match(git(['show', `${mixedCommit}:${authPath}`]), /Mixed/);
    assert.equal(JSON.parse(git(['show', `${mixedCommit}:package.json`])).description, 'Updated extension description');
    assert.equal(posts, 1);
    lookupStatus = 503;
    branchConfirmed = false;
    await assert.rejects(publish(options), /Pull request lookup failed \(HTTP 503\).*branch was pushed/);
    assert.equal(branchConfirmed, true);
    // Check a failed transmission and a lost acknowledgement against the original lease.
    lookupStatus = 200;
    for (const [failure, expectedAttempts] of [['before', 2], ['after', 1]]) {
        const before = attempts;
        const successfulPushes = pushes;
        remote = `${base}\t${ref}\n`;
        transportFailure = failure;
        assert.deepEqual(await publish(options), { url, number: 19, created: false });
        assert.equal(attempts - before, expectedAttempts);
        assert.equal(pushes, successfulPushes + 1);
        assert.equal(remote, `${mixedCommit}\t${ref}\n`);
    }
});

test('a Modifications run only replaces the issue branch while it still points to the pinned proposal', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'spe-publish-proposal-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const repositoryPath = join(directory, 'repo');
    const source = 'src/commands/ContainerType/RegisterOnLocalTenant.ts';
    await mkdir(join(repositoryPath, 'src', 'commands', 'ContainerType'), { recursive: true });
    const git = (args, env, input) => execFileSync('git', ['-C', repositoryPath, ...args], { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    await writeFile(join(repositoryPath, source), 'export const registerLater = false;\n');
    git(['init', '-q']);
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Base']);
    const base = git(['rev-parse', 'HEAD']).trim();
    await writeFile(join(repositoryPath, source), 'export const registerLater = true;\n');
    git(['add', '-u']);
    const reviewedTree = git(['write-tree']).trim();
    git(['restore', '--staged', '--', '.']);
    await writeFile(join(directory, 'feature.patch'), git(['diff', '--binary']));
    await writeFile(join(directory, 'feature-base-sha.txt'), `${base}\n`);
    git(['restore', source]);
    const revised = { ...issue, body: `${issue.body}\n### Modifications\nKeep the prompt. Change the menu label.` };
    const review = { id: 1, user: { id: 41898282, type: 'Bot' }, body: `${reviewMarker} ${reviewRevision(revised)} ready -->\nReady.` };
    const pinned = 'a'.repeat(40);
    const ref = 'refs/heads/feature-agent/issue-8';
    let remote = `${'b'.repeat(40)}\t${ref}\n`;
    const leases = [];
    const run = (command, args, options, input) => {
        if (args[1] === 'ls-remote') return remote;
        if (args.includes('push')) {
            leases.push(args.find(arg => arg.startsWith('--force-with-lease=')));
            remote = `${args.at(-1).split(':')[0]}\t${ref}\n`;
            return '';
        }
        return git(args.slice(1), options, input);
    };
    const fetcher = async (target) => {
        const { pathname } = new URL(target);
        if (pathname.endsWith('/pulls')) return Response.json([{ html_url: 'https://github.com/owner/repo/pull/19', number: 19 }]);
        return Response.json(pathname.endsWith('/comments') ? [review] : revised);
    };
    const env = { ...process.env, GH_TOKEN: 'mock', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: base,
        GITHUB_RUN_ID: '42', RUNNER_TEMP: directory, FEATURE_REQUEST_APPROVERS: 'maintainer', REVIEWED_TREE: reviewedTree };
    const options = { event: { ...event, issue: revised }, directory, run, fetcher };
    await assert.rejects(publish({ ...options, env }), /pinned proposal do not match/);
    await assert.rejects(publish({ ...options, env: { ...env, PROPOSAL_COMMIT: pinned } }), /changed after it was pinned/);
    assert.deepEqual(leases, []);
    remote = `${pinned}\t${ref}\n`;
    assert.deepEqual(await publish({ ...options, env: { ...env, PROPOSAL_COMMIT: pinned } }),
        { url: 'https://github.com/owner/repo/pull/19', number: 19, created: false });
    assert.deepEqual(leases, [`--force-with-lease=${ref}:${pinned}`]);
    await assert.rejects(publish({ event, env: { ...env, PROPOSAL_COMMIT: pinned }, directory, run,
        fetcher: async (target) => Response.json(new URL(target).pathname.endsWith('/comments')
            ? [{ ...review, body: `${reviewMarker} ${reviewRevision(issue)} ready -->\nReady.` }] : issue) }), /pinned proposal do not match/);
});
