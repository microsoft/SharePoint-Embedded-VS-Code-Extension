import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { githubActionsBotId, issueClient } from './feature-issue.mjs';
import { validateStagedDiff } from './publish-feature.mjs';

const sha = /^[a-f0-9]{40}$/;
const HUMAN_REVIEW = 'ready-for-human-review';
const BOT_NAME = 'SPE Feature Agent';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
export const CONTRACT_PATH = '.agent-runs/github-intake-contract.json';

// Messages are public: keep them to the issue-diagnostic character set (no slashes, quotes, or markup).
export class ProposalError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

async function handedOffForHumanReview(github) {
    for (let page = 1; page <= 10; page++) {
        const events = await github(`/events?per_page=100&page=${page}`);
        if (!Array.isArray(events)) throw new Error('Unexpected issue events response.');
        if (events.some(e => e?.event === 'labeled' && e.label?.name === HUMAN_REVIEW &&
            e.actor?.id === githubActionsBotId && e.actor.type === 'Bot')) return true;
        if (events.length < 100) return false;
    }
    return false;
}

// Pins the issue's published proposal and verifies it was produced by a reviewed handoff on the default
// branch history. Only the proposal's diff is reused; the workflow base remains the trusted checkout.
export async function pinProposal({ contract, issueNumber, repository, git, github }) {
    const revision = contract.proposalRevision;
    if (!revision) return contract;
    const branch = `feature-agent/issue-${issueNumber}`;
    if (revision.branch !== branch || !sha.test(contract.baseBranch) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
        throw new ProposalError('invalid', 'The Modifications run has an invalid proposal request.');
    }
    const ref = `refs/heads/${branch}`;
    const upstream = `https://github.com/${repository}.git`;
    const remote = git(['ls-remote', '--refs', upstream, ref]).trim();
    if (!remote) {
        throw new ProposalError('missing', 'Modifications were requested, but no previous proposal branch exists for this issue. Remove the Modifications section for a fresh run, or restore the reviewed proposal first.');
    }
    const [commit, remoteRef, ...extra] = remote.split('\t');
    if (!sha.test(commit) || remoteRef !== ref || extra.length) throw new ProposalError('invalid', 'The proposal branch lookup returned an unexpected response.');
    git(['fetch', '--quiet', '--no-tags', upstream, commit]);
    const [self, parent, ...otherParents] = git(['rev-list', '--parents', '-n', '1', commit]).trim().split(' ');
    const [author, authorEmail, committer, committerEmail, ...message] = git(['show', '-s', '--format=%an%x00%ae%x00%cn%x00%ce%x00%B', commit]).split('\0');
    if (self !== commit || !sha.test(parent ?? '') || otherParents.length || author !== BOT_NAME || committer !== BOT_NAME ||
        authorEmail !== BOT_EMAIL || committerEmail !== BOT_EMAIL ||
        message.join('\0').trim() !== `Implement SPE extension feature request #${issueNumber}`) {
        throw new ProposalError('unverified', 'The proposal branch tip is not an unmodified feature agent handoff. Restore the reviewed proposal or remove the Modifications section.');
    }
    try {
        git(['merge-base', '--is-ancestor', parent, contract.baseBranch]);
    } catch {
        throw new ProposalError('stale', 'The previous proposal is not based on the current default branch history. Remove the Modifications section for a fresh run.');
    }
    try {
        validateStagedDiff(git(['diff', '--raw', '--no-renames', '-z', parent, commit]));
    } catch {
        throw new ProposalError('unverified', 'The previous proposal contains changes outside the publishing scope.');
    }
    if (!await handedOffForHumanReview(github)) {
        throw new ProposalError('unverified', 'This issue has no recorded ready-for-human-review handoff, so there is no reviewed proposal to modify.');
    }
    return { ...contract, proposalRevision: { ...revision, commit, parent } };
}

function execute(args) {
    try {
        return execFileSync('git', ['--no-pager', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
    } catch (error) {
        throw new Error(`git ${args[0]} failed (exit ${error.status ?? 'unknown'}).`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv[2] !== 'pin') throw new Error('Expected pin.');
    const env = process.env;
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    const contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
    try {
        const pinned = await pinProposal({ contract, issueNumber: event.issue.number, repository: env.GITHUB_REPOSITORY,
            git: execute, github: issueClient(event, env) });
        await writeFile(CONTRACT_PATH, JSON.stringify(pinned));
        const commit = pinned.proposalRevision?.commit;
        console.log(commit ? `Pinned previous proposal ${commit}.` : 'No Modifications section: this is a fresh run.');
        if (commit) await appendFile(env.GITHUB_OUTPUT, `proposal-commit=${commit}\n`);
    } catch (error) {
        if (!(error instanceof ProposalError)) throw error;
        await appendFile(env.GITHUB_OUTPUT, `diagnostic=${error.message}\n`);
        console.log(`::error title=Previous proposal unavailable::${error.message}`);
        process.exitCode = 1;
    }
}
