import { writeFile } from 'node:fs/promises';
import { expect, type Locator } from '@playwright/test';

export async function captureUxEvidence(target: Locator, path: string): Promise<void> {
    await expect(target).toBeVisible({ timeout: 10_000 });
    const png = await target.screenshot({ type: 'png', timeout: 10_000 });
    if (!await target.isVisible()) {
        throw new Error('The verified UX element disappeared during screenshot capture.');
    }
    await writeFile(path, png);
}
