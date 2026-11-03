/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import { FilePreviewService } from '../../src/services/StorageExplorer/FilePreviewService';
import { seedState } from '../helpers/graphMock';
import { openStorageExplorer } from '../helpers/mock/harness';
import { FakeGraphClient } from '../api/fakeClient';
import { MP4_FIXTURE } from '../helpers/mp4Fixture';

test.use({ channel: 'chromium' });

test('all MP4 preview controls request the host player instead of a SharePoint embed session', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Clip.MP4' });
    const { view } = await openStorageExplorer(page, state);
    await view.openContainer('Seed Container');
    await view.select(item.name);
    const opened = () => page.evaluate(() =>
        window.__SPE_TEST_POSTED__?.filter(message => message.command === 'videoOpened').length ?? 0);

    await view.tid('action-preview').click();
    await expect.poll(opened).toBe(1);
    await view.row(item.name).dblclick();
    await expect.poll(opened).toBe(2);
    await view.row(item.name).getByTitle('Preview', { exact: true }).click();
    await expect.poll(opened).toBe(3);
    await view.openRowMenu(item.name);
    await view.clickMenuItem('preview');
    await expect.poll(opened).toBe(4);
    await expect(view.tid('action-open-dropdown')).toBeDisabled();

    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    const requests = messages.filter(message => message.command === 'rpc/request' && message.op === 'drive.openVideo');
    expect(requests).toHaveLength(4);
    for (const request of requests) {
        expect(request.params).toEqual({ driveId: state.containers[0].id, itemId: item.id });
    }
    expect(messages.some(message =>
        message.command === 'openExternal'
        || ['drive.getItemWebUrl', 'drive.getPreviewUrl', 'drive.download'].includes(String(message.op))
    )).toBe(false);
});

test('MP4 preview remains blocked without readContent', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Clip.mp4' });
    state.appPermissionGrants.set('spe-ui-test', { delegatedPermissions: ['read'], applicationPermissions: [] });
    const { view } = await openStorageExplorer(page, state);
    await view.openContainer('Seed Container');
    await view.select(item.name);
    await expect(view.tid('action-preview')).toHaveAttribute('aria-disabled', 'true');
    await view.row(item.name).dblclick();
    await expect(page.getByTestId('permission-notice')).toContainText('readContent');
    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    expect(messages.some(message => message.op === 'drive.openVideo' || message.command === 'videoOpened')).toBe(false);
});

test('the native browser player decodes, plays, and seeks an MP4 served by the host Graph stream', async ({ page }) => {
    const content = new Uint8Array(MP4_FIXTURE);
    const fake = new FakeGraphClient();
    fake.responder = call => {
        if (!call.path.endsWith('/contentStream')) {
            return { name: 'Clip.mp4', size: content.length, file: { mimeType: 'video/mp4' } };
        }
        const range = /^bytes=(\d+)-(\d+)$/.exec(call.headers.Range ?? '');
        return range
            ? new Response(content.slice(Number(range[1]), Number(range[2]) + 1), {
                status: 206, headers: { 'Content-Range': `bytes ${range[1]}-${range[2]}/${content.length}` },
            })
            : new Response(content);
    };
    const service = new FilePreviewService(fake as unknown as Client, () => 'test-identity');
    let url = '';
    let failures = 0;
    try {
        await service.open('d1', 'i1', async () => undefined, async target => {
            url = target;
            return true;
        }, () => { failures++; }, 'mp4');
        const response = await page.goto(url);
        expect(response?.headers()['content-type']).toBe('video/mp4');
        const video = page.locator('video');
        await expect(video).toBeVisible();
        await video.evaluate(async (element: HTMLVideoElement) => {
            element.muted = true;
            await element.play();
        });
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(2);
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
        await video.evaluate((element: HTMLVideoElement) => {
            element.pause();
            element.currentTime = 0.01;
        });
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.seeking && element.currentTime === 0.01)).toBe(true);
        expect(await video.evaluate((element: HTMLVideoElement) => element.error)).toBeNull();
        expect(failures).toBe(0);
        expect(fake.calls.some(call => call.path.endsWith('/contentStream') && call.version === 'beta')).toBe(true);
        expect(fake.calls.some(call => call.path.endsWith('/preview'))).toBe(false);
    } finally {
        service.dispose();
    }
});
