import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { reviewMarker, reviewRevision, TITLE_PREFIX } from './feature-issue.mjs';
import { publish, validateStagedDiff } from './publish-feature.mjs';
import { classifyFeatureHandoff, updateFeatureHandoff } from './feature-handoff.mjs';
import { appendIssueDelivery, splitIssueDelivery } from './issue-delivery-section.mjs';

const repository = 'owner/repo';
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
    for (const raw of [
        '', record('.github/workflows/validate.yml'), record('src/utils/package.json'),
        record('src/client.ts'), record('tools/agent-loop/publish-feature.mjs'),
        record('src/utils/.env'), record('src/utils/example.ts', '120000'),
        record('src/utils/example.ts', '100755'), record('src/utils/../extension.ts'),
    ]) assert.throws(() => validateStagedDiff(raw));
});

test('flagging sensitive changes is independent of delivering the reviewed patch and VSIX', () => {
    const row = (path, mode = '100644') => `:100644 ${mode} aaaaaaa bbbbbbb M\0${path}\0`;
    const ordinary = row('webview-ui/src/components/example.tsx');
    const workflow = '.github/workflows/validate.yml';
    const manifest = 'package.json';
    assert.deepEqual(classifyFeatureHandoff(ordinary), { autoPublish: true, reviewPaths: [] });
    const auth = 'src/services/Auth/GraphAuthProvider.ts';
    assert.deepEqual(classifyFeatureHandoff(ordinary + row(auth)), { autoPublish: true, reviewPaths: [auth] });
    assert.deepEqual(classifyFeatureHandoff(ordinary + row(workflow) + row(manifest)),
        { autoPublish: false, reviewPaths: [workflow, manifest] });
    assert.deepEqual(classifyFeatureHandoff(row('src/utils/example.ts', '100755')),
        { autoPublish: false, reviewPaths: ['src/utils/example.ts'] });
    assert.throws(() => classifyFeatureHandoff(row('src/utils/example.ts', '120000')));
});

test('the issue description reports the branch and direct downloads without changing readiness', async () => {
    let current = { ...issue };
    const methods = [];
    const env = {
        GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '42', GH_TOKEN: 'mock',
        FEATURE_REQUEST_APPROVERS: 'maintainer', PATCH_ARTIFACT_ID: '122', VSIX_ARTIFACT_ID: '123',
        REVIEW_FILES: '["src/services/Auth/GraphAuthProvider.ts"]', AUTO_PUBLISH: 'true', BRANCH_PUSHED: 'true',
    };
    const fetcher = async (url, init) => {
        assert.equal(new URL(url).pathname, '/repos/owner/repo/issues/8');
        if (init.method === 'GET') return Response.json(current);
        methods.push(init.method);
        current = { ...current, ...JSON.parse(init.body) };
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
    assert.match(current.body, /No draft PR was opened/);
    assert.match(current.body, /GraphAuthProvider\.ts/);
    await updateFeatureHandoff(event, { ...env, GITHUB_RUN_ID: '43', DRAFT_PR_NUMBER: '19' }, fetcher);
    assert.deepEqual(methods, ['PATCH', 'PATCH']);
    assert.match(current.body, /Draft PR: \[#19\]/);
    assert.equal(current.body.match(/^## Feature agent delivery$/gm).length, 1);
    await updateFeatureHandoff(event, env, fetcher);
    assert.equal(splitIssueDelivery(current.body).runId, '43');
    current.body = current.body.replace('Unclear prompt.', 'Updated problem.');
    await updateFeatureHandoff(event, { ...env, GITHUB_RUN_ID: '44' }, fetcher);
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

test('publishes one draft from an isolated index and recovers an already-pushed identical commit', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'spe-publish-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const repositoryPath = join(directory, 'repo');
    const authPath = 'src/services/Auth/GraphAuthProvider.ts';
    await mkdir(join(repositoryPath, 'src', 'services', 'Auth'), { recursive: true });
    const git = (args, env, input) => execFileSync('git', ['-C', repositoryPath, ...args], {
        env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const file = join(repositoryPath, authPath);
    await writeFile(file, 'export const prompt = "Old";\n');
    git(['init', '-q']);
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Base']);
    const base = git(['rev-parse', 'HEAD']).trim();
    await writeFile(file, 'export const prompt = "New";\n');
    await writeFile(join(directory, 'feature.patch'), git(['diff', '--binary']));
    await writeFile(join(directory, 'feature-base-sha.txt'), `${base}\n`);
    git(['restore', authPath]);
    const env = {
        ...process.env, GH_TOKEN: 'mock', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: base, GITHUB_RUN_ID: '42', RUNNER_TEMP: directory, FEATURE_REQUEST_APPROVERS: 'maintainer',
        TESTABLE_VSIX_URL: `https://github.com/${repository}/actions/runs/42/artifacts/123`,
    };
    const ref = 'refs/heads/feature-agent/issue-8';
    const url = `https://github.com/${repository}/pull/19`;
    let remote = '';
    let pushes = 0;
    let posts = 0;
    let pr;
    let failBeforePr = true;
    let current = issue;
    const run = (command, args, options, input) => {
        if (command === 'git') {
            assert.equal(args[0], '--no-pager');
            if (args[1] === 'ls-remote') return remote;
            if (args.includes('push')) {
                assert.ok(args.includes(`--force-with-lease=${ref}:`));
                const head = args.at(-1).split(':')[0];
                assert.match(git(['show', `${head}:${authPath}`]), /New/);
                remote = `${head}\t${ref}\n`;
                pushes++;
                return '';
            }
            return git(args, options, input);
        }
        assert.equal(command, 'gh');
        if (args.includes('GET')) return JSON.stringify(pr ? [pr] : []);
        assert.equal(args[3], `repos/${repository}/pulls`);
        const payload = JSON.parse(input);
        assert.equal(payload.draft, true);
        assert.equal(payload.base, 'main');
        assert.equal(payload.head, 'feature-agent/issue-8');
        assert.match(payload.body, /Implements #8/);
        assert.match(payload.body, /\[Download the testable VSIX\]\(https:\/\/github\.com\/owner\/repo\/actions\/runs\/42\/artifacts\/123\)/);
        if (failBeforePr) throw new Error('simulated API failure');
        posts++;
        pr = { html_url: url, number: 19, head: { sha: remote.split('\t')[0] } };
        return JSON.stringify(pr);
    };
    const review = { id: 1, user: { id: 41898282, type: 'Bot' }, body: `${reviewMarker} ${reviewRevision(issue)} ready -->\nReady.` };
    let branchConfirmed = false;
    const options = { event, env, directory, run, onBranch: () => { branchConfirmed = true; },
        fetcher: async (url) => Response.json(url.includes('/comments?') ? [review] : current) };
    current = { ...issue, body: `${issue.body}\nEdited` };
    await assert.rejects(publish(options), /Issue text changed/);
    assert.equal(pushes, 0);
    current = issue;
    await assert.rejects(publish(options), /simulated API failure/);
    assert.equal(branchConfirmed, true);
    failBeforePr = false;
    assert.deepEqual(await publish(options), { url, number: 19, created: true });
    assert.deepEqual(await publish(options), { url, number: 19, created: false });
    assert.equal(pushes, 1);
    assert.equal(posts, 1);
    assert.equal(git(['status', '--porcelain']), '');
});
