import { execFileSync } from 'node:child_process';
import { appendFile, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { intake, publishablePath } from './feature-issue.mjs';

const sha = /^[a-f0-9]{40}$/;
const maximumPatchBytes = 2 * 1024 * 1024;

export function reviewedDiff(raw) {
    const records = raw.split('\0');
    if (records.pop() !== '' || !records.length || records.length % 2 !== 0) {
        throw new Error('The review patch did not produce a valid, nonempty staged diff.');
    }
    const files = [];
    for (let i = 0; i < records.length; i += 2) {
        const modes = /^:(000000|100644|100755) (000000|100644|100755) [a-f0-9]+ [a-f0-9]+ [AMD]$/.exec(records[i]);
        if (!modes || !records[i + 1]) {
            throw new Error('The review patch includes files or file modes outside the publishing scope.');
        }
        files.push({ path: records[i + 1], executable: modes[1] === '100755' || modes[2] === '100755' });
    }
    return files;
}

export function validateStagedDiff(raw) {
    const files = reviewedDiff(raw);
    if (files.some(({ path }) => path.toLowerCase().startsWith('.github/workflows/'))) {
        throw new Error('Workflow definitions require a maintainer push because GitHub can run them before merge. No partial branch was published.');
    }
    if (files.some(file => !publishablePath(file.path))) {
        throw new Error('The review patch includes files or file modes outside the publishing scope.');
    }
}

export class TransientGitTransportError extends Error {}

function execute(command, args, env, input) {
    try {
        return execFileSync(command, args, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
    } catch (error) {
        if ((args.includes('push') || args.includes('ls-remote')) &&
            (error.code === 'ETIMEDOUT' || /Connection (?:timed out|reset)|Could not resolve host|remote end hung up unexpectedly|requested URL returned error: (?:502|503|504)\b/i.test(error.stderr ?? ''))) {
            throw new TransientGitTransportError('Git temporarily lost contact with the repository.');
        }
        throw new Error(`${command} ${args.find((arg) => !arg.startsWith('-'))} failed (exit ${error.status ?? 'unknown'}).`);
    }
}

export async function publish({ event, env, directory, run = execute, fetcher = fetch, onBranch = () => {} }) {
    const issue = event.issue?.number;
    const base = event.repository?.default_branch;
    if (!Number.isSafeInteger(issue) || issue <= 0 || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '') ||
        event.repository?.full_name !== env.GITHUB_REPOSITORY || typeof base !== 'string' || !base ||
        env.GITHUB_REF !== `refs/heads/${base}` || !sha.test(env.GITHUB_SHA ?? '') ||
        !/^\d+$/.test(env.GITHUB_RUN_ID ?? '') || !env.GH_TOKEN) {
        throw new Error('Publishing requires a default-branch GitHub issue run and a repository token.');
    }
    const branch = `feature-agent/issue-${issue}`;
    const [owner] = env.GITHUB_REPOSITORY.split('/');
    const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/pulls`;
    const git = (args, overrides, input) => run('git', ['--no-pager', ...args], { ...env, ...overrides }, input);
    const pullRequestApi = (url, body) => fetcher(url, {
        method: body ? 'POST' : 'GET',
        headers: {
            Authorization: `Bearer ${env.GH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body && JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
    });
    async function requireApproval() {
        const decision = await intake({ event, mode: 'confirm', env, fetcher });
        if (!decision.approved) throw new Error(decision.message);
    }
    await requireApproval();
    const patch = join(directory, 'feature.patch');
    const baseFile = join(directory, 'feature-base-sha.txt');
    const [patchStat, baseStat] = await Promise.all([lstat(patch), lstat(baseFile)]);
    if (!patchStat.isFile() || patchStat.size === 0 || patchStat.size > maximumPatchBytes ||
        !baseStat.isFile() || baseStat.size > 42 || (await readFile(baseFile, 'utf8')).trim() !== env.GITHUB_SHA ||
        git(['rev-parse', 'HEAD']).trim() !== env.GITHUB_SHA) {
        throw new Error('Review artifact is invalid or its base does not match the trusted checkout.');
    }

    const scratch = await mkdtemp(join(env.RUNNER_TEMP, 'feature-publish-'));
    let commit;
    try {
        const index = { GIT_INDEX_FILE: join(scratch, 'index') };
        git(['read-tree', env.GITHUB_SHA], index);
        git(['apply', '--cached', '--whitespace=nowarn', '--', patch], index);
        git(['diff', '--cached', '--check', '--no-ext-diff', env.GITHUB_SHA], index);
        validateStagedDiff(git(['diff', '--cached', '--raw', '--no-renames', '-z', env.GITHUB_SHA], index));
        const tree = git(['write-tree'], index).trim();
        if (!sha.test(env.REVIEWED_TREE ?? '') || tree !== env.REVIEWED_TREE) {
            throw new Error('Branch contents do not match the reviewed source tree used to build the VSIX. Nothing was pushed.');
        }
        const date = git(['show', '-s', '--format=%cI', env.GITHUB_SHA]).trim();
        commit = git(['commit-tree', tree, '-p', env.GITHUB_SHA], {
            GIT_AUTHOR_NAME: 'SPE Feature Agent', GIT_COMMITTER_NAME: 'SPE Feature Agent',
            GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
            GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
            GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
        }, `Implement SPE extension feature request #${issue}\n`).trim();
    } finally {
        await rm(scratch, { recursive: true, force: true });
    }
    if (!sha.test(commit)) throw new Error('Could not create a commit for the reviewed patch.');
    const ref = `refs/heads/${branch}`;
    const upstream = `https://github.com/${env.GITHUB_REPOSITORY}.git`;
    async function remoteTip() {
        for (let attempt = 0; ; attempt++) {
            try {
                const remote = git(['ls-remote', '--refs', upstream, ref]).trim();
                const [tip, remoteRef, ...extra] = remote.split('\t');
                if (remote && (!sha.test(tip) || remoteRef !== ref || extra.length)) throw new Error('Unexpected issue branch lookup response.');
                return tip;
            } catch (error) {
                if (attempt || !(error instanceof TransientGitTransportError)) throw error;
                await delay(500);
            }
        }
    }
    const expected = await remoteTip();
    if (expected !== commit) {
        for (let attempt = 0; ; attempt++) {
            await requireApproval();
            try {
                git(['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential',
                    'push', '--no-verify', `--force-with-lease=${ref}:${expected}`, upstream, `${commit}:${ref}`]);
                break;
            } catch (error) {
                if (!(error instanceof TransientGitTransportError)) throw error;
                await delay(500);
                const actual = await remoteTip();
                if (actual === commit) break; // The push landed but its acknowledgement was lost.
                if (actual !== expected || attempt) throw error;
            }
        }
    }
    await onBranch(commit);
    const query = new URLSearchParams({ state: 'open', head: `${owner}:${branch}`, base });
    const lookup = await pullRequestApi(`${endpoint}?${query}`);
    if (!lookup.ok) throw new Error(`Pull request lookup failed (HTTP ${lookup.status}). The feature branch was pushed.`);
    const existing = await lookup.json();
    if (!Array.isArray(existing)) throw new Error('Unexpected pull request lookup response.');
    if (existing.length) {
        return { url: existing[0].html_url, number: existing[0].number, created: false };
    }

    await requireApproval();
    const runUrl = `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    const vsixUrl = env.TESTABLE_VSIX_URL;
    const vsixLink = vsixUrl?.startsWith(`${runUrl}/artifacts/`) && /^\d+$/.test(vsixUrl.slice(`${runUrl}/artifacts/`.length))
        ? `\n[Download the testable VSIX](${vsixUrl})\n` : '';
    const response = await pullRequestApi(endpoint, {
        base, head: branch, draft: true, title: `SPE extension feature request #${issue}`,
        body: `Implements #${issue}.\n\nGenerated by the SPE feature agent. Review and approval are required before merging.\n\n[Agent run and reviewed patch](${runUrl})\n${vsixLink}`,
    });
    if (!response.ok) {
        if (response.status === 403) {
            const error = await response.json().catch(() => null);
            if (error?.message === 'GitHub Actions is not permitted to create or approve pull requests.') {
                return { policyBlocked: true };
            }
        }
        throw new Error(`Draft pull request creation failed (HTTP ${response.status}). The feature branch was pushed.`);
    }
    const pr = await response.json();
    return { url: pr.html_url, number: pr.number, created: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const env = process.env;
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await publish({ event, env, directory: process.argv[2],
        onBranch: commit => appendFile(env.GITHUB_OUTPUT, `branch-pushed=true\nbranch-commit=${commit}\n`) });
    if (result.policyBlocked) {
        await appendFile(env.GITHUB_OUTPUT, 'pr-policy-blocked=true\n');
        console.warn('::warning::GitHub Actions is not permitted to create pull requests. The feature branch is available for a manual PR.');
    } else {
        if (!Number.isSafeInteger(result.number) || result.number < 1) throw new Error('Invalid pull request number.');
        await appendFile(env.GITHUB_OUTPUT, `pr-number=${result.number}\n`);
        console.log(`${result.created ? 'Opened draft PR' : 'PR already exists'}: ${result.url}`);
    }
}
