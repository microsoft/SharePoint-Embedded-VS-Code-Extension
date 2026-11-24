import { execFileSync } from 'node:child_process';
import { appendFile, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
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

export function requiresManualPublishing(file) {
    return file.executable || !publishablePath(file.path);
}

export function validateStagedDiff(raw) {
    if (reviewedDiff(raw).some(requiresManualPublishing)) {
        throw new Error('The review patch includes files or file modes outside the publishing scope.');
    }
}

function execute(command, args, env, input) {
    try {
        return execFileSync(command, args, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
    } catch (error) {
        throw new Error(`${command} ${command === 'git' ? args.find((arg) => !arg.startsWith('-')) : 'pull request API'} failed (exit ${error.status ?? 'unknown'}).`);
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
    const endpoint = `repos/${env.GITHUB_REPOSITORY}/pulls`;
    const git = (args, overrides, input) => run('git', ['--no-pager', ...args], { ...env, ...overrides }, input);
    const gh = (args, input) => run('gh', ['api', ...args], env, input);
    async function requireApproval() {
        const decision = await intake({ event, mode: 'confirm', env, fetcher });
        if (!decision.approved) throw new Error(decision.message);
    }
    await requireApproval();
    const existing = JSON.parse(gh(['--method', 'GET', endpoint, '-f', 'state=open', '-f', `head=${owner}:${branch}`, '-f', `base=${base}`]));
    if (!Array.isArray(existing)) throw new Error('Unexpected pull request lookup response.');

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
    if (existing.length) {
        if (existing[0].head?.sha !== commit) throw new Error('An existing pull request has different changes.');
        await onBranch();
        return { url: existing[0].html_url, number: existing[0].number, created: false };
    }

    await requireApproval();
    const ref = `refs/heads/${branch}`;
    const upstream = `https://github.com/${env.GITHUB_REPOSITORY}.git`;
    const remote = git(['ls-remote', '--refs', upstream, ref]).trim();
    if (!remote) {
        git(['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential',
            'push', '--no-verify', `--force-with-lease=${ref}:`, upstream, `${commit}:${ref}`]);
    } else if (remote !== `${commit}\t${ref}`) {
        throw new Error('The issue branch already has different changes. It will not be overwritten.');
    }
    await onBranch();

    await requireApproval();
    const runUrl = `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    const vsixUrl = env.TESTABLE_VSIX_URL;
    const vsixLink = vsixUrl?.startsWith(`${runUrl}/artifacts/`) && /^\d+$/.test(vsixUrl.slice(`${runUrl}/artifacts/`.length))
        ? `\n[Download the testable VSIX](${vsixUrl})\n` : '';
    const pr = JSON.parse(gh(['--method', 'POST', endpoint, '--input', '-'], JSON.stringify({
        base, head: branch, draft: true, title: `SPE extension feature request #${issue}`,
        body: `Implements #${issue}.\n\nGenerated by the SPE feature agent. Review and approval are required before merging.\n\n[Agent run and reviewed patch](${runUrl})\n${vsixLink}`,
    })));
    return { url: pr.html_url, number: pr.number, created: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const env = process.env;
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await publish({ event, env, directory: process.argv[2],
        onBranch: () => appendFile(env.GITHUB_OUTPUT, 'branch-pushed=true\n') });
    if (!Number.isSafeInteger(result.number) || result.number < 1) throw new Error('Invalid pull request number.');
    await appendFile(env.GITHUB_OUTPUT, `pr-number=${result.number}\n`);
    console.log(`${result.created ? 'Opened draft PR' : 'PR already exists'}: ${result.url}`);
}
