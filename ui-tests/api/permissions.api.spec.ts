/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { PermissionGraphService } from '../../webview-ui/src/api/services/PermissionGraphService';
import { FakeGraphClient, fakeAuthProvider } from './fakeClient';

const CBASE = '/storage/fileStorage/containers';

function svc() {
    const fake = new FakeGraphClient();
    return { fake, s: new PermissionGraphService(fake as unknown as Client, fakeAuthProvider) };
}

test.describe('PermissionGraphService — item', () => {
    test('listItemPermissions()', async () => {
        const { fake, s } = svc();
        await s.listItemPermissions('d1', 'item1');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/drives/d1/items/item1/permissions' });
    });

    test('createSharingLink()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'p1' });
        await s.createSharingLink('d1', 'item1', 'view', 'organization');
        expect(fake.last).toMatchObject({ method: 'POST', path: '/drives/d1/items/item1/createLink' });
        expect(fake.last.body).toMatchObject({ type: 'view', scope: 'organization' });
    });

    test('updateItemPermission()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'p1' });
        await s.updateItemPermission('d1', 'item1', 'p1', { roles: ['read'] });
        expect(fake.last).toMatchObject({ method: 'PATCH', path: '/drives/d1/items/item1/permissions/p1' });
        expect(fake.last.body).toMatchObject({ roles: ['read'] });
    });

    test('deleteItemPermission()', async () => {
        const { fake, s } = svc();
        await s.deleteItemPermission('d1', 'item1', 'p1');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: '/drives/d1/items/item1/permissions/p1' });
    });
});

test.describe('PermissionGraphService — container', () => {
    test('listContainerPermissions()', async () => {
        const { fake, s } = svc();
        await s.listContainerPermissions('c1');
        expect(fake.last).toMatchObject({ method: 'GET', path: `${CBASE}/c1/permissions` });
    });

    test('addContainerPermission() for a user', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'p1' });
        await s.addContainerPermission('c1', { id: 'u1', displayName: 'Ada', email: 'ada@x.com', userPrincipalName: 'ada@x.com', kind: 'user' }, 'writer');
        expect(fake.last).toMatchObject({ method: 'POST', path: `${CBASE}/c1/permissions` });
        expect(fake.last.body).toMatchObject({ roles: ['writer'], grantedToV2: { user: { userPrincipalName: 'ada@x.com' } } });
    });

    test('addContainerPermission() for a group', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'p2' });
        await s.addContainerPermission('c1', { id: 'g1', displayName: 'Eng', email: '', kind: 'group' }, 'reader');
        expect(fake.last.body).toMatchObject({ roles: ['reader'], grantedToV2: { group: { id: 'g1' } } });
    });

    test('updateContainerPermission()', async () => {
        const { fake, s } = svc();
        fake.responder = () => ({ id: 'p1' });
        await s.updateContainerPermission('c1', 'p1', 'manager');
        expect(fake.last).toMatchObject({ method: 'PATCH', path: `${CBASE}/c1/permissions/p1` });
        expect(fake.last.body).toMatchObject({ roles: ['manager'] });
    });

    test('deleteContainerPermission()', async () => {
        const { fake, s } = svc();
        await s.deleteContainerPermission('c1', 'p1');
        expect(fake.last).toMatchObject({ method: 'DELETE', path: `${CBASE}/c1/permissions/p1` });
    });
});
