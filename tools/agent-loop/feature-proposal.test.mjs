import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pinProposal, ProposalError } from './feature-proposal.mjs';

const bot = ['-c', 'user.name=SPE Feature Agent', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
const human = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.com'];
const handoff = [{ event: 'labeled', label: { name: 'ready-for-human-review' }, actor: { id: 41898282, type: 'Bot' } }];
const publicDiagnostic = /^[A-Za-z0-9 ().,:;'-]+$/;

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'spe-proposal-pin-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const remote = join(root, 'remote');
    await mkdir(join(remote, 'src', 'commands'), { recursive: true });
    const inRemote = (...args) => execFileSync('git', ['-C', remote, ...args], { encoding: 'utf8' }).trim();
    inRemote('init', '-q', '-b', 'main');
    await writeFile(join(remote, 'src', 'commands', 'register.ts'), 'export const register = 1;\n');
    inRemote('add', '.');
    inRemote(...human, 'commit', '-qm', 'main');
    const proposalParent = inRemote('rev-parse', 'HEAD');
    const publishProposal = async (files, { identity = bot, message = 'Implement SPE extension feature request #87', parent = proposalParent } = {}) => {
        inRemote('checkout', '-q', '--detach', parent);
        for (const [file, text] of Object.entries(files)) {
            await mkdir(join(remote, file, '..'), { recursive: true });
            await writeFile(join(remote, file), text);
        }
        inRemote('add', '.');
        inRemote(...identity, 'commit', '-qm', message);
        inRemote('branch', '-f', 'feature-agent/issue-87', 'HEAD');
        inRemote('checkout', '-q', 'main');
        return inRemote('rev-parse', 'feature-agent/issue-87');
    };
    await writeFile(join(remote, 'README.md'), 'current main\n');
    inRemote('add', '.');
    inRemote(...human, 'commit', '-qm', 'current main');
    const local = join(root, 'local');
    execFileSync('git', ['clone', '-q', '--branch', 'main', remote, local]);
    const base = execFileSync('git', ['-C', local, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const calls = [];
    const git = args => {
        calls.push(args[0]);
        const mapped = args.map(arg => arg === 'https://github.com/owner/repo.git' ? remote : arg);
        return execFileSync('git', ['-C', local, '--no-pager', ...mapped], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    };
    const contract = { taskId: 'github-issue-87', baseBranch: base,
        proposalRevision: { branch: 'feature-agent/issue-87', modifications: 'Keep the action. Change the menu.' } };
    return { remote, inRemote, publishProposal, proposalParent, base, git, calls, contract };
}

const pin = (f, events = handoff) => pinProposal({ contract: f.contract, issueNumber: 87, repository: 'owner/repo', git: f.git,
    github: async () => events });

async function rejectsWith(promise, code) {
    await assert.rejects(promise, error => error instanceof ProposalError && error.code === code && publicDiagnostic.test(error.message));
}

test('a fresh run does not look up any previous proposal', async t => {
    const f = await fixture(t);
    const fresh = { ...f.contract, proposalRevision: undefined };
    assert.equal(await pinProposal({ contract: fresh, issueNumber: 87, repository: 'owner/repo', git: f.git, github: async () => [] }), fresh);
    assert.deepEqual(f.calls, []);
});

test('a Modifications run pins the verified reviewed proposal without changing the trusted base', async t => {
    const f = await fixture(t);
    const commit = await f.publishProposal({ 'src/commands/register.ts': 'export const register = 2;\n' });
    const pinned = await pin(f);
    assert.deepEqual(pinned.proposalRevision, { ...f.contract.proposalRevision, commit, parent: f.proposalParent });
    assert.equal(pinned.baseBranch, f.base);
});

test('a missing, altered, stale, out-of-scope, or never-handed-off proposal stops the run', async t => {
    const f = await fixture(t);
    await rejectsWith(pin(f), 'missing');
    await f.publishProposal({ 'src/commands/register.ts': 'export const register = 2;\n' }, { identity: human });
    await rejectsWith(pin(f), 'unverified');
    await f.publishProposal({ 'src/commands/register.ts': 'export const register = 2;\n' }, { message: 'Implement SPE extension feature request #86' });
    await rejectsWith(pin(f), 'unverified');
    await f.publishProposal({ '.github/workflows/feature-intake.yml': 'on: push\n' });
    await rejectsWith(pin(f), 'unverified');
    f.inRemote('checkout', '-q', '--orphan', 'unrelated');
    f.inRemote(...human, 'commit', '-q', '--allow-empty', '-m', 'unrelated');
    const unrelated = f.inRemote('rev-parse', 'HEAD');
    f.inRemote('checkout', '-q', '-f', 'main');
    await f.publishProposal({ 'src/commands/register.ts': 'export const register = 2;\n' }, { parent: unrelated });
    await rejectsWith(pin(f), 'stale');
    await f.publishProposal({ 'src/commands/register.ts': 'export const register = 2;\n' });
    await rejectsWith(pin(f, []), 'unverified');
    await rejectsWith(pin(f, [{ ...handoff[0], actor: { id: 7, type: 'User' } }]), 'unverified');
});
