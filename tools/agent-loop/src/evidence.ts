import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { LoadedContract, RunRecord, RunPhase } from './types';

const pendingRunWrites = new Map<string, Promise<void>>();

export async function initializeEvidence(
    repoRoot: string,
    loaded: LoadedContract,
    run: RunRecord
): Promise<void> {
    await mkdir(run.artifactsDir, { recursive: true });
    await copyFile(loaded.contractPath, path.join(run.artifactsDir, 'contract.json'));
    await copyFile(loaded.policyPath, path.join(run.artifactsDir, 'authority-policy.json'));
    await writeRunRecord(repoRoot, run);
}

export async function transitionRun(
    repoRoot: string,
    run: RunRecord,
    phase: RunPhase,
    error?: string
): Promise<void> {
    run.phase = phase;
    run.updatedAt = new Date().toISOString();
    if (error) {
        run.errors.push(error);
    }
    await writeRunRecord(repoRoot, run);
}

export async function writeRunRecord(_repoRoot: string, run: RunRecord): Promise<void> {
    const filePath = path.join(run.artifactsDir, 'run.json');
    // Parallel workers share this file and its temporary path.
    const previous = pendingRunWrites.get(filePath);
    const write = (previous?.catch(() => undefined) ?? Promise.resolve()).then(() => writeJson(filePath, run));
    pendingRunWrites.set(filePath, write);
    try {
        await write;
    } finally {
        if (pendingRunWrites.get(filePath) === write) {
            pendingRunWrites.delete(filePath);
        }
    }
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
}

export async function writeText(filePath: string, value: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, value, 'utf8');
}
