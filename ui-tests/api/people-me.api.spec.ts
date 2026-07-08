/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { PeopleGraphService } from '../../webview-ui/src/api/services/PeopleGraphService';
import { MeGraphService } from '../../webview-ui/src/api/services/MeGraphService';
import { FakeGraphClient, fakeAuthProvider } from './fakeClient';

test.describe('PeopleGraphService', () => {
    test('searchUsers() → GET /users with $search + ConsistencyLevel', async () => {
        const fake = new FakeGraphClient();
        fake.responder = () => ({ value: [] });
        const s = new PeopleGraphService(fake as unknown as Client, fakeAuthProvider);
        await s.searchUsers('ada');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/users', top: 8 });
        expect(fake.last.search).toContain('displayName:ada');
        expect(fake.last.headers.ConsistencyLevel).toBe('eventual');
    });

    test('searchUsers() short-circuits on empty query', async () => {
        const fake = new FakeGraphClient();
        const s = new PeopleGraphService(fake as unknown as Client, fakeAuthProvider);
        const res = await s.searchUsers('   ');
        expect(res).toEqual([]);
        expect(fake.calls.length).toBe(0);
    });

    test('searchGroups() → GET /groups with $search', async () => {
        const fake = new FakeGraphClient();
        fake.responder = () => ({ value: [] });
        const s = new PeopleGraphService(fake as unknown as Client, fakeAuthProvider);
        await s.searchGroups('eng');
        expect(fake.last).toMatchObject({ method: 'GET', path: '/groups', top: 8 });
        expect(fake.last.search).toContain('displayName:eng');
    });

    test('search() queries both users and groups', async () => {
        const fake = new FakeGraphClient();
        fake.responder = () => ({ value: [] });
        const s = new PeopleGraphService(fake as unknown as Client, fakeAuthProvider);
        await s.search('x');
        const paths = fake.calls.map((c) => c.path).sort();
        expect(paths).toContain('/users');
        expect(paths).toContain('/groups');
    });
});

test.describe('MeGraphService', () => {
    test('get() → GET /me', async () => {
        const fake = new FakeGraphClient();
        fake.responder = () => ({ id: 'me', displayName: 'Test' });
        const s = new MeGraphService(fake as unknown as Client, fakeAuthProvider);
        await s.get();
        expect(fake.last).toMatchObject({ method: 'GET', path: '/me' });
    });
});
