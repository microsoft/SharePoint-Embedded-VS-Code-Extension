import { writeFile } from 'node:fs/promises';
import { errors, expect, type Locator } from '@playwright/test';

export async function captureUxEvidence(target: Locator, path: string, { required = false } = {}): Promise<void> {
    // The visible outcome is a behavioral assertion. Only the subsequent image capture is optional.
    await expect(target).toBeVisible({ timeout: 10_000 });
    try {
        const png = await target.screenshot({ type: 'png', timeout: 10_000 });
        if (await target.isVisible()) {
            await writeFile(path, png);
            return;
        }
        if (required) throw new Error('The verified UX element disappeared during required screenshot capture.');
    } catch (error) {
        if (required || !(error instanceof errors.TimeoutError)) throw error;
    }
    // Do not leave a stale image for the uploader.
    await writeFile(path, '');
    console.warn('Optional UX preview omitted: the verified element could not be captured while visible.');
}
