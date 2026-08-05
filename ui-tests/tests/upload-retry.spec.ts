/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';

const SEED_CONTAINER = 'Seed Container';

test.describe('Upload retry', () => {
    test('"Retry all" re-runs every failed upload', async ({ storage, page }) => {
        await storage.openContainer(SEED_CONTAINER);

        // Fail the content-upload PUT until we flip the flag. Registered after the fixture mock,
        // so this route wins for `:/content` requests.
        let failMode = true;
        await page.route((url) => url.pathname.endsWith('/content'), async (route) => {
            if (failMode) {
                await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'serverError', message: 'boom' } }) });
            } else {
                await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: `up-${Math.random().toString(36).slice(2)}`, name: 'x', size: 3, file: { mimeType: 'text/plain' } }) });
            }
        });

        // Kick off two uploads via the hidden file input (no native dialog needed).
        await page.locator('[data-testid="action-upload-input"]').setInputFiles([
            { name: 'up1.txt', mimeType: 'text/plain', buffer: Buffer.from('one') },
            { name: 'up2.txt', mimeType: 'text/plain', buffer: Buffer.from('two') },
        ]);

        // Both fail → the upload card shows and the "Retry all" control appears.
        await expect(page.locator('[data-testid="upload-card"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-testid="upload-retry-all"]')).toBeVisible({ timeout: 15_000 });

        // Allow uploads to succeed, then retry all at once.
        failMode = false;
        await page.locator('[data-testid="upload-retry-all"]').click();

        // No failures remain → the "Retry all" control disappears.
        await expect(page.locator('[data-testid="upload-retry-all"]')).toHaveCount(0, { timeout: 15_000 });
    });
});
