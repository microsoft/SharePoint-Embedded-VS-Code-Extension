import { mkdir } from 'node:fs/promises';
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
    const result = await git(worktreePath, ['status', '--porcelain=v1', '-z']);
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

export async function cherryPick(worktreePath: string, commit: string): Promise<void> {
    const result = await git(worktreePath, ['cherry-pick', commit], false);
    if (result.exitCode !== 0) {
        await git(worktreePath, ['cherry-pick', '--abort'], false);
        throw new Error(`Failed to integrate commit ${commit}: ${result.stderr.trim()}`);
    }
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

export async function committedChangedPaths(
    worktreePath: string,
    baseCommit: string,
    headCommit = 'HEAD'
): Promise<string[]> {
    const result = await git(worktreePath, [
        'diff',
        '--name-only',
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
