/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { seedState } from '../helpers/graphMock';
import { openStorageExplorer } from '../helpers/mock/harness';
import type { Client } from '@microsoft/microsoft-graph-client';
import { FilePreviewService } from '../../src/services/StorageExplorer/FilePreviewService';
import { FakeGraphClient } from '../api/fakeClient';

// The full Chromium build includes the PDF viewer; headless-shell does not.
test.use({ channel: 'chromium' });

test('all PDF viewing controls request the host viewer, not a SharePoint URL or download', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Report.PDF' });
    const { view } = await openStorageExplorer(page, state);
    await view.openContainer('Seed Container');
    await view.select(item.name);
    const opened = () => page.evaluate(() =>
        window.__SPE_TEST_POSTED__?.filter(message => message.command === 'pdfOpened').length ?? 0);

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
    await expect(view.row(item.name).getByTitle('Open in browser', { exact: true })).toHaveCount(0);
    await view.openRowMenu(item.name);
    await expect(view.tid('context-menu-item-open-in-browser')).toHaveCount(0);
    await expect(view.tid('context-menu-item-open-in-desktop')).toHaveCount(0);

    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    const requests = messages.filter(message => message.command === 'rpc/request' && message.op === 'drive.openPdf');
    expect(requests).toHaveLength(4);
    for (const request of requests) {
        expect(request.params).toEqual({ driveId: state.containers[0].id, itemId: item.id });
    }
    expect(messages.some(message =>
        message.command === 'openExternal'
        || ['drive.getItemWebUrl', 'drive.getPreviewUrl', 'drive.download'].includes(String(message.op))
    )).toBe(false);
});

test('PDF viewing remains blocked without readContent', async ({ page }) => {
    const state = seedState();
    const item = state.addDriveItem(state.containers[0].id, { name: 'Report.pdf' });
    state.appPermissionGrants.set('spe-ui-test', { delegatedPermissions: ['read'], applicationPermissions: [] });
    const { view } = await openStorageExplorer(page, state);
    await view.openContainer('Seed Container');
    await view.select(item.name);
    await expect(view.tid('action-preview')).toHaveAttribute('aria-disabled', 'true');
    await view.row(item.name).dblclick();
    await expect(page.getByTestId('permission-notice')).toContainText('readContent');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await view.openRowMenu(item.name);
    await view.clickMenuItem('preview');
    await expect(page.getByTestId('permission-notice')).toContainText('readContent');
    const messages = await page.evaluate(() => window.__SPE_TEST_POSTED__ ?? []);
    expect(messages.some(message => message.op === 'drive.openPdf' || message.command === 'pdfOpened')).toBe(false);
});

test.describe('native PDF rendering', () => {
    test('the browser renders PDF bytes served by the host Graph streaming service', async ({ page }) => {
        const content = 'BT /F1 18 Tf 50 100 Td (Graph PDF viewing) Tj ET';
        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];
        let pdf = '%PDF-1.4\n';
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(pdf.length);
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xref = pdf.length;
        pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
        pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
        pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const fake = new FakeGraphClient();
        fake.responder = call => {
            if (!call.path.endsWith('/contentStream')) {
                return { name: 'Report.pdf', size: pdf.length, file: { mimeType: 'application/pdf' } };
            }
            const range = /^bytes=(\d+)-(\d+)$/.exec(call.headers.Range ?? '');
            return range
                ? new Response(pdf.slice(Number(range[1]), Number(range[2]) + 1), {
                    status: 206, headers: { 'Content-Range': `bytes ${range[1]}-${range[2]}/${pdf.length}` },
                })
                : new Response(pdf);
        };
        const service = new FilePreviewService(fake as unknown as Client, () => 'test-identity');
        let url = '';
        let failures = 0;
        try {
            await service.open('d1', 'i1', async () => undefined, async target => {
                url = target;
                return true;
            }, () => { failures++; });
            const response = await page.goto(url);
            expect(response?.status()).toBe(200);
            expect(response?.headers()['content-type']).toBe('application/pdf');
            await expect.poll(async () => {
                for (const frame of page.frames()) {
                    const progress = await frame.evaluate(() => {
                        const viewer = document.querySelector('pdf-viewer');
                        return viewer ? Reflect.get(viewer, 'loadProgress_') : undefined;
                    });
                    if (progress === 100) { return true; }
                }
                return false;
            }).toBe(true);
            expect(failures).toBe(0);
            expect(fake.calls.some(call => call.path.endsWith('/contentStream') && call.version === 'beta')).toBe(true);
        } finally {
            service.dispose();
        }
    });
});
