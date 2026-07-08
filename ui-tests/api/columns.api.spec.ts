/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { ColumnGraphService } from '../../webview-ui/src/api/services/ColumnGraphService';
import { FakeGraphClient, fakeAuthProvider } from './fakeClient';

const CBASE = '/storage/fileStorage/containers';

function svc() {
    const fake = new FakeGraphClient();
    return { fake, s: new ColumnGraphService(fake as unknown as Client, fakeAuthProvider) };
}

test.describe('ColumnGraphService', () => {
    test('listContainerColumns()', async () => {
        const { fake, s } = svc();
        await s.listContainerColumns('c1');
        expect(fake.last).toMatchObject({ method: 'GET', path: `${CBASE}/c1/columns` });
    });

    test('createContainerColumn()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'col1' });
        await s.createContainerColumn('c1', { name: 'Project', text: {} });
        expect(fake.last).toMatchObject({ method: 'POST', path: `${CBASE}/c1/columns` });
        expect(fake.last.body).toMatchObject({ name: 'Project' });
    });

    test('updateContainerColumn()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'col1' });
        await s.updateContainerColumn('c1', 'col1', { displayName: 'Proj' });
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${CBASE}/c1/columns/col1` });
        expect(fake.last.body).toMatchObject({ displayName: 'Proj' });
    });

    test('deleteContainerColumn()', async () => {
        const { fake, s } = svc();
        await s.deleteContainerColumn('c1', 'col1');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: `${CBASE}/c1/columns/col1` });
    });

    test('getItemFields()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({});
        await s.getItemFields('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1/listitem/fields' });
    });

    test('updateItemFields()', async () => {
        const { fake, s } = svc();
        await s.updateItemFields('d1', 'item1', { Project: 'X' });
        expect(fake.last).toMatchObject({ method: 'PATCH', path: '/drives/d1/items/item1/listitem/fields' });
        expect(fake.last.body).toMatchObject({ Project: 'X' });
    });
});
