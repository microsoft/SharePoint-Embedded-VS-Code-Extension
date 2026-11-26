import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parsePorcelainZ } from './paths';
import { runProcess } from './process';

let worktreeQueue: Promise<void> = Promise.resolve();

export async function findRepositoryRoot(cwd: string): Promise<string> {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim();
}

export async function resolveCommit(repoRoot: string, reference: string): Promise<string> {
    const candidates = [reference, `origin/${reference}`];
    let lastError = '';

    for (const candidate of candidates) {
        const result = await git(repoRoot, ['rev-parse', '--verify', `${candidate}^{commit}`], false);
        if (result.exitCode === 0) {
            return result.stdout.trim();
        }
        lastError = result.stderr;
    }

    throw new Error(`Unable to resolve base branch "${reference}": ${lastError.trim()}`);
}

export async function createWorktree(
    repoRoot: string,
    worktreePath: string,
    commit: string,
    branchName?: string
): Promise<void> {
    const operation = worktreeQueue.then(async () => {
        await mkdir(path.dirname(worktreePath), { recursive: true });
        const args = branchName
            ? ['worktree', 'add', '-b', branchName, worktreePath, commit]
            : ['worktree', 'add', '--detach', worktreePath, commit];
        await git(repoRoot, args);
    });
    worktreeQueue = operation.catch(() => undefined);
    await operation;
}

export async function changedPaths(worktreePath: string): Promise<string[]> {
    const result = await git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
    return parsePorcelainZ(result.stdout);
}

export async function createWorkerCommit(
    worktreePath: string,
    taskId: string,
    workerId: string,
    attempt: number
): Promise<string> {
    await git(worktreePath, ['add', '--all']);
    const diff = await git(worktreePath, ['diff', '--cached', '--quiet'], false);
    if (diff.exitCode === 0) {
        return (await git(worktreePath, ['rev-parse', 'HEAD'])).stdout.trim();
    }

    await git(worktreePath, [
        '-c',
        'user.name=Agent Loop',
        '-c',
        'user.email=agent-loop@users.noreply.github.com',
        'commit',
        '-m',
        `${taskId}: ${workerId} attempt ${attempt}`
    ]);
    return (await git(worktreePath, ['rev-parse', 'HEAD'])).stdout.trim();
}

export class ProposalConflictError extends Error {
    constructor(readonly paths: string[]) {
        super(`The previous proposal conflicts with the current base in ${paths.length} file(s).`);
    }
}

// Reapplies one pinned commit's changes onto the checked-out base with a three-way merge.
// A conflict aborts with the conflicting paths; nothing is resolved automatically.
export async function reapplyCommit(
    repoRoot: string, worktreePath: string, parent: string, commit: string, patchPath: string, message: string
): Promise<{ commit: string; paths: string[] }> {
    const patch = await git(repoRoot, ['diff', '--binary', '--no-renames', '--no-ext-diff', '--no-textconv', '--full-index', parent, commit]);
    await mkdir(path.dirname(patchPath), { recursive: true });
    await writeFile(patchPath, patch.stdout, 'utf8');
    const applied = await git(worktreePath, ['apply', '--3way', '--index', '--whitespace=nowarn', patchPath], false);
    if (applied.exitCode !== 0) {
        const unmerged = (await git(worktreePath, ['diff', '--name-only', '--diff-filter=U', '-z'], false)).stdout
            .split('\0').filter(Boolean).sort();
        await git(worktreePath, ['reset', '--hard', '--quiet'], false);
        if (unmerged.length) throw new ProposalConflictError(unmerged);
        throw new Error(`Unable to reapply the previous proposal: ${applied.stderr.trim()}`);
    }
    const paths = await changedPaths(worktreePath);
    if (!paths.length) return { commit: await currentCommit(worktreePath), paths };
    await git(worktreePath, [
        '-c', 'user.name=Agent Loop', '-c', 'user.email=agent-loop@users.noreply.github.com',
        'commit', '--quiet', '--no-verify', '-m', message
    ]);
    return { commit: await currentCommit(worktreePath), paths };
}

export async function cherryPick(worktreePath: string, commit: string): Promise<void> {
    const result = await git(worktreePath, ['cherry-pick', commit], false);
    if (result.exitCode !== 0) {
        await git(worktreePath, ['cherry-pick', '--abort'], false);
        throw new Error(`Failed to integrate commit ${commit}: ${result.stderr.trim()}`);
    }
}

export async function commitsSince(worktreePath: string, base: string, head: string): Promise<string[]> {
    await git(worktreePath, ['merge-base', '--is-ancestor', base, head]);
    return (await git(worktreePath, ['rev-list', '--reverse', `${base}..${head}`])).stdout.trim().split(/\s+/).filter(Boolean);
}

export async function currentCommit(worktreePath: string): Promise<string> {
    return (await git(worktreePath, ['rev-parse', 'HEAD'])).stdout.trim();
}

export async function pathExistsAtCommit(
    repoRoot: string,
    commit: string,
    repositoryPath: string
): Promise<boolean> {
    const result = await git(
        repoRoot,
        ['cat-file', '-e', `${commit}:${repositoryPath.replaceAll('\\', '/')}`],
        false
    );
    return result.exitCode === 0;
}

export async function readFileAtCommit(
    repoRoot: string,
    commit: string,
    repositoryPath: string
): Promise<string> {
    const result = await git(
        repoRoot,
        ['show', `${commit}:${repositoryPath.replaceAll('\\', '/')}`],
        false
    );
    if (result.exitCode !== 0) {
        throw new Error(
            `Unable to read ${repositoryPath} at ${commit}: ${result.stderr.trim()}`
        );
    }
    return result.stdout;
}

export async function committedChangedPaths(
    worktreePath: string,
    baseCommit: string,
    headCommit = 'HEAD',
    presentOnly = false
): Promise<string[]> {
    const result = await git(worktreePath, [
        'diff',
        '--name-only',
        '--no-renames',
        ...(presentOnly ? ['--diff-filter=AMT'] : []),
        '-z',
        `${baseCommit}..${headCommit}`
    ]);
    return result.stdout
        .split('\0')
        .filter(Boolean)
        .map(value => value.replaceAll('\\', '/'))
        .sort();
}

export async function diffCheck(worktreePath: string): Promise<void> {
    await git(worktreePath, ['diff', '--check']);
}

interface GitResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

async function git(cwd: string, args: string[], throwOnFailure = true): Promise<GitResult> {
    const result = await runProcess('git', ['--no-pager', ...args], {
        cwd,
        timeoutMs: 120_000
    });

    if (throwOnFailure && result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
    }

    return result;
}
