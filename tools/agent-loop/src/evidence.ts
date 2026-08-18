import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { LoadedContract, RunRecord, RunPhase } from './types';

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
    await writeJson(path.join(run.artifactsDir, 'run.json'), run);
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
