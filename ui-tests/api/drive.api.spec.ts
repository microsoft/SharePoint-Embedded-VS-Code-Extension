/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { DriveGraphService } from '../../src/services/StorageExplorer/DriveGraphService';
import { FakeGraphClient } from './fakeClient';

function svc() {
    const fake = new FakeGraphClient();
    return { fake, s: new DriveGraphService(fake as unknown as Client) };
}

test.describe('DriveGraphService', () => {
    test('listChildren() at root', async () => {
        const { fake, s } = svc();
        await s.listChildren('d1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/root/children', top: 200 });
    });

    test('listChildren() in a folder', async () => {
        const { fake, s } = svc();
        await s.listChildren('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1/children' });
    });

    test('listChildren() loads only the first page and omits downloadUrl from the list select', async () => {
        const { fake, s } = svc();
        const nextUrl = 'https://graph.microsoft.com/v1.0/drives/d1/root/children?$skiptoken=ABC';
        fake.responder = (call) => call.path === nextUrl
            ? { value: [{ id: 'i3' }, { id: 'i4' }] }
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
            : { value: [{ id: 'i1' }, { id: 'i2' }], '@odata.nextLink': nextUrl };

        await s.listChildren('d1');

        // First page: LIST_SELECT (no expensive downloadUrl), top 200.
        expect(fake.calls[0].path).toBe('/drives/d1/root/children');
        expect(String(fake.calls[0].select)).not.toContain('downloadUrl');
        expect(fake.calls[0].top).toBe(200);
        // The server-provided nextLink is NOT followed: further pages need an explicit request.
        expect(fake.calls.length).toBe(1);
    });

    test('get()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'item1' });
        await s.get('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1' });
    });

    test('createFolder() at root', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'f1', folder: {} });
        await s.createFolder('d1', null, 'Docs');
        expect(fake.last).toMatchObject({ method: 'POST', path: '/drives/d1/root/children' });
        expect(fake.last.body).toMatchObject({ name: 'Docs', folder: {} });
    });

    test('createFolder() in a folder', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'f2', folder: {} });
        await s.createFolder('d1', 'parent1', 'Sub');
        expect(fake.last).toMatchObject({ method: 'POST', path: '/drives/d1/items/parent1/children' });
    });

    test('createFile() at root → PUT content', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'file1' });
        await s.createFile('d1', null, 'Report.docx');
        expect(fake.last.method).toBe('PUT');
        expect(fake.last.path).toContain('/drives/d1/root:/');
        expect(fake.last.path).toContain(':/content');
    });

    test('rename()', async () => {
        const { fake, s } = svc();
        await s.rename('d1', 'item1', 'New.docx');
        expect(fake.last).toMatchObject({ method: 'PATCH', path: '/drives/d1/items/item1' });
        expect(fake.last.body).toMatchObject({ name: 'New.docx' });
    });

    test('delete()', async () => {
        const { fake, s } = svc();
        await s.delete('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: '/drives/d1/items/item1' });
    });

    test('uploadSmall() → PUT content with content type', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'file1' });
        await s.uploadSmall(
            'd1',
            'parent1',
            'Report.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            new Uint8Array([1, 2, 3])
        );
        expect(fake.last).toMatchObject({ method: 'PUT', path: '/drives/d1/items/parent1:/Report.docx:/content' });
        expect(fake.last.headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(fake.last.body).toBeInstanceOf(Uint8Array);
    });

    test('createUploadSession() → POST session request and returns upload URL', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ uploadUrl: 'https://contoso.sharepoint.com/upload-session' });
        const uploadUrl = await s.createUploadSession('d1', null, 'Large.bin');
        expect(fake.last).toMatchObject({ method: 'POST', path: '/drives/d1/root:/Large.bin:/createUploadSession' });
        expect(fake.last.body).toMatchObject({ item: { '@microsoft.graph.conflictBehavior': 'rename' } });
        expect(uploadUrl).toBe('https://contoso.sharepoint.com/upload-session');
    });

    test('listRecycleBin()', async () => {
        const { fake, s } = svc();
        await s.listRecycleBin('c1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/storage/fileStorage/containers/c1/recycleBin/items' });
    });

    test('restoreFromRecycleBin()', async () => {
        const { fake, s } = svc();
        await s.restoreFromRecycleBin('c1', 'item1');
        expect(fake.last.method).toBe('POST');
        expect(fake.last.path).toContain('recycleBin/items/restore');
        expect(fake.last.body).toMatchObject({ ids: ['item1'] });
    });

    test('permanentlyDelete()', async () => {
        const { fake, s } = svc();
        await s.permanentlyDelete('c1', 'item1');
        expect(fake.last.method).toBe('POST');
        expect(fake.last.path).toContain('recycleBin/items/delete');
        expect(fake.last.body).toMatchObject({ ids: ['item1'] });
    });

    test('getFields()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({});
        await s.getFields('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1/listItem/fields' });
    });

    test('updateFields()', async () => {
        const { fake, s } = svc();
        await s.updateFields('d1', 'item1', { Project: 'X' });
        expect(fake.last).toMatchObject({ method: 'PATCH', path: '/drives/d1/items/item1/listItem/fields' });
        expect(fake.last.body).toMatchObject({ Project: 'X' });
    });

    test('listVersions()', async () => {
        const { fake, s } = svc();
        await s.listVersions('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1/versions' });
    });

    test('restoreVersion()', async () => {
        const { fake, s } = svc();
        await s.restoreVersion('d1', 'item1', 'v2');
        expect(fake.last).toMatchObject({ method: 'POST', path: '/drives/d1/items/item1/versions/v2/restoreVersion' });
    });

    test('deleteVersion()', async () => {
        const { fake, s } = svc();
        await s.deleteVersion('d1', 'item1', 'v2');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: '/drives/d1/items/item1/versions/v2' });
    });

    test('getDownloadUrl()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ '@microsoft.graph.downloadUrl': 'https://x/dl' });
        const url = await s.getDownloadUrl('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1' });
        expect(url).toBe('https://x/dl');
    });

    test('getPreviewUrl()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ getUrl: 'https://x/preview' });
        const url = await s.getPreviewUrl('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'POST', path: '/drives/d1/items/item1/preview' });
        // The service appends `?nb=true` (suppress the preview nav bar).
        expect(url).toContain('https://x/preview');
        expect(url).toContain('nb=true');
    });
});
