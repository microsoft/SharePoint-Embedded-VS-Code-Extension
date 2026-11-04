import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export interface ProcessResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationSeconds: number;
}

export interface ProcessOptions {
    cwd: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    stdoutPath?: string;
    stderrPath?: string;
}

const MAX_CAPTURE_LENGTH = 10 * 1024 * 1024;

export async function runProcess(
    executable: string,
    args: string[],
    options: ProcessOptions
): Promise<ProcessResult> {
    const started = Date.now();

    return new Promise<ProcessResult>((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            windowsHide: true
        });

        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let stdoutLength = 0;
        let stderrLength = 0;
        let timedOut = false;

        child.stdout.on('data', (chunk: Buffer) => {
            if (stdoutLength < MAX_CAPTURE_LENGTH) {
                stdout.push(chunk);
                stdoutLength += chunk.length;
            }
        });
        child.stderr.on('data', (chunk: Buffer) => {
            if (stderrLength < MAX_CAPTURE_LENGTH) {
                stderr.push(chunk);
                stderrLength += chunk.length;
            }
        });
        child.on('error', reject);

        const timer = options.timeoutMs
            ? setTimeout(() => {
                timedOut = true;
                child.kill();
            }, options.timeoutMs)
            : undefined;

        child.on('close', async code => {
            if (timer) {
                clearTimeout(timer);
            }

            const stdoutText = Buffer.concat(stdout).toString('utf8');
            const stderrText = Buffer.concat(stderr).toString('utf8');

            try {
                await persistOutput(options.stdoutPath, stdoutText);
                await persistOutput(options.stderrPath, stderrText);
            } catch (error) {
                reject(error);
                return;
            }

            resolve({
                exitCode: code ?? -1,
                stdout: stdoutText,
                stderr: stderrText,
                timedOut,
                durationSeconds: (Date.now() - started) / 1000
            });
        });
    });
}

export async function runShellCommand(command: string, options: ProcessOptions): Promise<ProcessResult> {
    if (process.platform === 'win32') {
        return runProcess(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', command],
            options
        );
    }

    return runProcess('/bin/bash', ['-lc', command], options);
}

async function persistOutput(filePath: string | undefined, content: string): Promise<void> {
    if (!filePath) {
        return;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
}

export function outputTail(value: string, maximumLength = 8000): string {
    return value.length <= maximumLength ? value : value.slice(-maximumLength);
}
