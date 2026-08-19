/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extension-app capability set and host-side operation authorization (AC-14, AC-15, AC-16).
 *
 * The host must decide whether an operation is allowed *before* touching Graph, and a denial
 * must name only the missing scopes — never the raw grant document.
 */

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import { REQUIRED_DELEGATED_PERMISSIONS } from '../../src/utils/ExtensionAppPermissionScopes';
import { FakeGraphClient, RecordedCall } from './fakeClient';

const CONTAINER_TYPE_ID = 'ct-1';
const CONTAINER_ID = 'b!c1';
const DRIVE_ID = 'b!c1';

const GRANT_PATH = 'applicationPermissionGrants';

/** Operations that must be gated, and the scope each one consumes. */
interface Case {
    scope: string;
    op: string;
    params: Record<string, unknown>;
    /** A recorded call that proves the operation actually reached Graph. */
    reachedGraph: (call: RecordedCall) => boolean;
}

const CASES: Case[] = [
    {
        scope: 'read',
        op: 'containers.list',
        params: {},
        reachedGraph: (c) => c.method === 'GET' && c.path.endsWith('/storage/fileStorage/containers'),
    },
    {
        scope: 'create',
        op: 'containers.create',
        params: { displayName: 'New' },
        reachedGraph: (c) => c.method === 'POST' && c.path.endsWith('/storage/fileStorage/containers'),
    },
    {
        scope: 'write',
        op: 'containers.rename',
        params: { containerId: CONTAINER_ID, displayName: 'Renamed' },
        reachedGraph: (c) => c.method === 'PATCH' && c.path.includes('/storage/fileStorage/containers/'),
    },
    {
        scope: 'delete',
        op: 'containers.delete',
        params: { containerId: CONTAINER_ID },
        reachedGraph: (c) => c.method === 'DELETE' && c.path.includes('/storage/fileStorage/containers/'),
    },
    {
        scope: 'readContent',
        op: 'drive.listChildren',
        params: { driveId: DRIVE_ID },
        reachedGraph: (c) => c.method === 'GET' && c.path.includes('/children'),
    },
    {
        scope: 'writeContent',
        op: 'drive.createFolder',
        params: { driveId: DRIVE_ID, parentId: null, name: 'F' },
        reachedGraph: (c) => c.method === 'POST' && c.path.includes('/children'),
    },
    {
        scope: 'enumeratePermissions',
        op: 'permissions.listContainerPermissions',
        params: { containerId: CONTAINER_ID },
        reachedGraph: (c) => c.method === 'GET' && c.path.endsWith('/permissions'),
    },
    {
        scope: 'addPermissions',
        op: 'permissions.addContainerPermission',
        params: { containerId: CONTAINER_ID, member: { id: 'u-1', displayName: 'Ada', kind: 'user' }, role: 'reader' },
        reachedGraph: (c) => c.method === 'POST' && c.path.endsWith('/permissions'),
    },
    {
        scope: 'updatePermissions',
        op: 'permissions.updateContainerPermission',
        params: { containerId: CONTAINER_ID, permissionId: 'p1', role: 'writer' },
        reachedGraph: (c) => c.method === 'PATCH' && c.path.includes('/permissions/'),
    },
    {
        scope: 'deletePermissions',
        op: 'permissions.deleteContainerPermission',
        params: { containerId: CONTAINER_ID, permissionId: 'p1' },
        reachedGraph: (c) => c.method === 'DELETE' && c.path.includes('/permissions/'),
    },
];

/** All scopes the guided workflow needs, per AC-14. */
const ALL_SCOPES = [
    'read',
    'write',
    'create',
    'delete',
    'readContent',
    'writeContent',
    'managePermissions',
];

/**
 * A host bound to a container type whose extension-app grant contains exactly `granted`.
 * Everything else answers with a benign success so a *missing* denial is visible as a
 * request that should not exist rather than as an unrelated failure.
 */
function hostWith(granted: string[]) {
    const fake = new FakeGraphClient();
    fake.responder = (call) => {
        if (call.path.includes(GRANT_PATH)) {
            return { id: 'app-1', appId: 'app-1', delegatedPermissions: granted, applicationPermissions: [] };
        }
        if (call.path.endsWith('/storage/fileStorage/containers') && call.method === 'GET') {
            return { value: [{ id: CONTAINER_ID, displayName: 'C', containerTypeId: CONTAINER_TYPE_ID }] };
        }
        if (call.path.includes('/storage/fileStorage/containers/') && call.method === 'GET') {
            return { id: CONTAINER_ID, displayName: 'C', containerTypeId: CONTAINER_TYPE_ID, status: 'active' };
        }
        if (call.method === 'GET') { return { value: [] }; }
        return { id: 'x', name: 'x', roles: ['reader'] };
    };
    return { fake, api: new StorageExplorerApi(CONTAINER_TYPE_ID, fake as unknown as Client) };
}

const context = { onProgress: () => { /* unused */ } };

test.describe('AC-14 — baseline extension-app capability set', () => {
    test('includes every capability the guided workflow needs', () => {
        for (const scope of ['read', 'write', 'create', 'delete', 'readContent', 'writeContent', 'managePermissions']) {
            expect(REQUIRED_DELEGATED_PERMISSIONS, `missing required scope: ${scope}`).toContain(scope);
        }
    });

    test('contains no duplicates', () => {
        expect(new Set(REQUIRED_DELEGATED_PERMISSIONS).size).toBe(REQUIRED_DELEGATED_PERMISSIONS.length);
    });
});

test.describe('AC-15 — operations are authorized before Graph is called', () => {
    for (const testCase of CASES) {
        test(`${testCase.op} is allowed with ${testCase.scope}`, async () => {
            const { fake, api } = hostWith(ALL_SCOPES);

            await api.execute(testCase.op, testCase.params, context).catch(() => undefined);

            expect(
                fake.calls.some(testCase.reachedGraph),
                `${testCase.op} must reach Graph when ${testCase.scope} is granted`
            ).toBe(true);
        });

        test(`${testCase.op} is denied without ${testCase.scope} and makes no Graph request`, async () => {
            const withoutScope = ALL_SCOPES.filter(
                (s) => s !== testCase.scope && !(testCase.scope.endsWith('Permissions') && s === 'managePermissions')
            );
            const { fake, api } = hostWith(withoutScope);

            const outcome = await api
                .execute(testCase.op, testCase.params, context)
                .then(() => 'resolved' as const, (error: unknown) => error);

            expect(outcome, `${testCase.op} must be rejected without ${testCase.scope}`).not.toBe('resolved');
            expect(
                fake.calls.filter(testCase.reachedGraph),
                `${testCase.op} must not touch Graph when denied`
            ).toHaveLength(0);
        });
    }

    test('managePermissions alone satisfies every permission-management operation', async () => {
        const permissionCases = CASES.filter((c) => c.scope.endsWith('Permissions'));
        expect(permissionCases.length).toBeGreaterThan(0);

        for (const testCase of permissionCases) {
            const { fake, api } = hostWith(['read', 'managePermissions']);

            await api.execute(testCase.op, testCase.params, context).catch(() => undefined);

            expect(
                fake.calls.some(testCase.reachedGraph),
                `${testCase.op} must be allowed by managePermissions`
            ).toBe(true);
        }
    });
});

test.describe('AC-16 — denials are typed and disclose only scope names', () => {
    test('a denied operation reports the missing scope and nothing about the grant document', async () => {
        const { api } = hostWith(['read']);

        const error = await api
            .execute('containers.create', { displayName: 'New' }, context)
            .then(() => null, (e: unknown) => e as { message?: string; code?: string });

        expect(error, 'containers.create must be denied without create').not.toBeNull();
        expect(error?.code).toBe('missingExtensionAppPermissions');
        expect(error?.message ?? '').toContain('create');
        // The grant document, app id and tenant details are host-only detail.
        expect(error?.message ?? '').not.toContain('applicationPermissionGrants');
        expect(error?.message ?? '').not.toContain('Bearer');
    });

    test('denial messaging is operation-specific rather than a single generic string', async () => {
        const readError = await hostWith(['create', 'write', 'delete'])
            .api.execute('containers.list', {}, context)
            .then(() => null, (e: unknown) => e as { message?: string });
        const contentError = await hostWith(['read', 'create', 'write', 'delete'])
            .api.execute('drive.listChildren', { driveId: DRIVE_ID }, context)
            .then(() => null, (e: unknown) => e as { message?: string });

        expect(readError, 'containers.list must be denied without read').not.toBeNull();
        expect(contentError, 'drive.listChildren must be denied without readContent').not.toBeNull();
        expect(readError?.message).not.toBe(contentError?.message);
        expect(contentError?.message ?? '').toContain('readContent');
    });
});
