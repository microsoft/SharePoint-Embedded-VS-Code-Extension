/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { ContainerGraphService } from '../../webview-ui/src/api/services/ContainerGraphService';
import { FakeGraphClient, fakeAuthProvider } from './fakeClient';

const BASE = '/storage/fileStorage/containers';
const DELETED = '/storage/fileStorage/deletedContainers';

function svc() {
    const fake = new FakeGraphClient();
    return { fake, s: new ContainerGraphService(fake as unknown as Client, fakeAuthProvider) };
}

test.describe('ContainerGraphService', () => {
    test('list()', async () => {
        const { fake, s } = svc();
        await s.list('ct-1');
        expect(fake.last).toMatchObject({ method: 'GET', path: BASE, version: 'v1.0' });
        expect(fake.last.filter).toContain('containerTypeId eq ct-1');
        expect(fake.last.expand).toContain('drive');
    });

    test('get()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'b!1' });
        await s.get('b!1');
        expect(fake.last).toMatchObject({ method: 'GET', path: `${BASE}/b!1`, version: 'v1.0' });
    });

    test('create()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'b!1', displayName: 'N', containerTypeId: 'ct-1' });
        await s.create('ct-1', 'N', 'desc');
        expect(fake.last).toMatchObject({ method: 'POST', path: BASE, version: 'v1.0' });
        expect(fake.last.body).toMatchObject({ displayName: 'N', containerTypeId: 'ct-1', description: 'desc' });
    });

    test('rename()', async () => {
        const { fake, s } = svc();
        await s.rename('b!1', 'New');
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${BASE}/b!1` });
        expect(fake.last.body).toMatchObject({ displayName: 'New' });
    });

    test('updateDescription()', async () => {
        const { fake, s } = svc();
        await s.updateDescription('b!1', 'd');
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${BASE}/b!1` });
        expect(fake.last.body).toMatchObject({ description: 'd' });
    });

    test('delete()', async () => {
        const { fake, s } = svc();
        await s.delete('b!1');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: `${BASE}/b!1` });
    });

    test('listDeleted()', async () => {
        const { fake, s } = svc();
        await s.listDeleted('ct-1');
        expect(fake.last).toMatchObject({ method: 'GET', path: DELETED });
        expect(fake.last.filter).toContain('containerTypeId eq ct-1');
    });

    test('restore()', async () => {
        const { fake, s } = svc();
        await s.restore('b!1');
        expect(fake.last).toMatchObject({ method: 'POST', path: `${DELETED}/b!1/restore` });
    });

    test('permanentlyDelete()', async () => {
        const { fake, s } = svc();
        await s.permanentlyDelete('b!1');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: `${DELETED}/b!1` });
    });

    test('getSettings()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ settings: {} });
        await s.getSettings('b!1');
        expect(fake.last).toMatchObject({ method: 'GET', path: `${BASE}/b!1`, select: 'settings' });
    });

    test('updateSettings()', async () => {
        const { fake, s } = svc();
        await s.updateSettings('b!1', { itemMajorVersionLimit: 100 });
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${BASE}/b!1` });
        expect(fake.last.body).toMatchObject({ settings: { itemMajorVersionLimit: 100 } });
    });

    test('getCustomProperties()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ Department: { value: 'Eng' } });
        await s.getCustomProperties('b!1');
        expect(fake.last).toMatchObject({ method: 'GET', path: `${BASE}/b!1/customProperties` });
    });

    test('setCustomProperty()', async () => {
        const { fake, s } = svc();
        await s.setCustomProperty('b!1', 'Department', 'Eng', true);
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${BASE}/b!1/customProperties` });
        expect(fake.last.body).toMatchObject({ Department: { value: 'Eng', isSearchable: true } });
    });

    test('deleteCustomProperty()', async () => {
        const { fake, s } = svc();
        await s.deleteCustomProperty('b!1', 'Department');
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${BASE}/b!1/customProperties` });
        expect((fake.last.body as Record<string, unknown>).Department).toBeNull();
    });
});
