/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The extension-app capability calculation and the completeness of the authorization matrix
 * (AC-14, AC-15).
 *
 * `permission-matrix.api.spec.ts` proves that representative operations are gated end to end.
 * This suite covers the layer underneath: how a raw grant expands into capabilities, and the
 * property that matters most for a security boundary — that *every* operation the webview may
 * name has an explicit entry, so a newly added operation cannot arrive ungated by omission.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
    calculateCapabilities,
    hasCapability,
    missingCapabilitiesForOperation,
    requiredCapabilitiesForOperation,
    OPERATION_REQUIRED_CAPABILITIES,
    PERMISSION_MANAGEMENT_CAPABILITIES,
    REQUIRED_DELEGATED_PERMISSIONS,
    STORAGE_EXPLORER_CAPABILITIES,
} from '../../src/utils/ExtensionAppPermissionScopes';
import type { StorageExplorerCapability } from '../../src/utils/ExtensionAppPermissionScopes';
import type { ContainerTypeAppPermission } from '../../src/models/schemas';
import type { StorageExplorerOperation } from '../../src/services/StorageExplorer/protocol';

const grant = (...permissions: string[]): ContainerTypeAppPermission[] =>
    permissions as ContainerTypeAppPermission[];

/** Operations that legitimately touch no container-type resource, so no grant gates them. */
const UNGATED: StorageExplorerOperation[] = [
    'authorization.get',
    'me.get',
    'people.search',
    'people.searchUsers',
    'people.searchGroups',
];

const KNOWN_CAPABILITIES: StorageExplorerCapability[] = [
    'read', 'write', 'create', 'delete', 'readContent', 'writeContent',
    'enumeratePermissions', 'addPermissions', 'updatePermissions', 'deletePermissions',
    'deleteOwnPermission', 'managePermissions',
];

test.describe('AC-14 — capability calculation', () => {
    test('an absent, empty, or "none" grant confers nothing', () => {
        expect([...calculateCapabilities(undefined)]).toEqual([]);
        expect([...calculateCapabilities(null)]).toEqual([]);
        expect([...calculateCapabilities([])]).toEqual([]);
        // `none` is Graph's explicit "no permissions" marker; reading it as a capability would
        // turn a deliberately empty grant into full access.
        expect([...calculateCapabilities(grant('none'))]).toEqual([]);
        expect(hasCapability(grant('none'), 'read')).toBe(false);
    });

    test('the baseline grant confers every capability the guided workflow needs', () => {
        const capabilities = calculateCapabilities(REQUIRED_DELEGATED_PERMISSIONS);

        for (const capability of KNOWN_CAPABILITIES) {
            expect(capabilities.has(capability), `baseline grant is missing ${capability}`).toBe(true);
        }
    });

    test('the baseline set names real workflow scopes only', () => {
        expect(REQUIRED_DELEGATED_PERMISSIONS).not.toContain('none');
        for (const scope of ['read', 'write', 'create', 'delete', 'readContent', 'writeContent', 'managePermissions']) {
            expect(REQUIRED_DELEGATED_PERMISSIONS, `baseline must request ${scope}`).toContain(scope);
        }
    });

    test('managePermissions expands to the permission-management capabilities and nothing more', () => {
        const capabilities = calculateCapabilities(grant('managePermissions'));

        for (const implied of PERMISSION_MANAGEMENT_CAPABILITIES) {
            expect(capabilities.has(implied), `managePermissions must imply ${implied}`).toBe(true);
        }
        // It is a permission umbrella, not a general one.
        for (const unrelated of ['read', 'write', 'create', 'delete', 'readContent', 'writeContent'] as StorageExplorerCapability[]) {
            expect(capabilities.has(unrelated), `managePermissions must not imply ${unrelated}`).toBe(false);
        }
    });

    test('the full umbrella confers every capability', () => {
        // `ContainerTypeAppPermissionGrantService.hasPermissions` accepts `full` in place of any
        // required scope, so the tree reports a `full` grant as ready. If this calculation did
        // not agree, that same grant would arrive at Storage Explorer reported as missing every
        // scope — a fully permissioned tenant with a fully disabled UI.
        const capabilities = calculateCapabilities(grant('full'));

        for (const capability of KNOWN_CAPABILITIES) {
            expect(capabilities.has(capability), `full must imply ${capability}`).toBe(true);
        }
        expect([...capabilities].sort()).toEqual([...STORAGE_EXPLORER_CAPABILITIES].sort());

        for (const operation of Object.keys(OPERATION_REQUIRED_CAPABILITIES) as StorageExplorerOperation[]) {
            expect(missingCapabilitiesForOperation(operation, grant('full')), `${operation}`).toEqual([]);
        }
    });

    test('the capability list and the expansion of full are the same set', () => {
        expect([...STORAGE_EXPLORER_CAPABILITIES].sort()).toEqual([...KNOWN_CAPABILITIES].sort());
    });

    test('scopes the matrix never names are ignored rather than admitted', () => {
        // `manageContent` and `unknownFutureValue` are real members of the Graph enum but are
        // not capabilities here. Carrying them into the set would put a value in it that no
        // requirement can consume, and would make a future scope look like a capability.
        expect([...calculateCapabilities(grant('manageContent', 'unknownFutureValue'))]).toEqual([]);
        expect([...calculateCapabilities(grant('manageContent', 'read'))]).toEqual(['read']);
        expect(missingCapabilitiesForOperation('drive.createFile', grant('manageContent', 'read', 'write')))
            .toEqual(['writeContent']);
    });

    test('a granular permission grant is not read as the umbrella', () => {
        // deleteOwnPermission is only conferred by the umbrella; inferring it from a granular
        // delete grant would let a call through that the service will refuse.
        expect(hasCapability(grant('deletePermissions'), 'deleteOwnPermission')).toBe(false);
        expect(hasCapability(grant('deletePermissions'), 'managePermissions')).toBe(false);
        expect(hasCapability(grant('managePermissions'), 'deleteOwnPermission')).toBe(true);
        expect(hasCapability(grant('deletePermissions'), 'deletePermissions')).toBe(true);
    });

    test('a partial grant confers exactly what it names', () => {
        const capabilities = calculateCapabilities(grant('read', 'create'));

        expect([...capabilities].sort()).toEqual(['create', 'read']);
        expect(hasCapability(grant('read', 'create'), 'delete')).toBe(false);
        expect(hasCapability(grant('read', 'create'), 'writeContent')).toBe(false);
    });

    test('an unrelated grant never satisfies a required capability by accident', () => {
        expect(missingCapabilitiesForOperation('drive.uploadSmall', grant('read', 'write', 'create', 'delete')))
            .toEqual(['writeContent']);
        expect(missingCapabilitiesForOperation('drive.getPreviewUrl', grant('read', 'writeContent')))
            .toEqual(['readContent']);
        expect(missingCapabilitiesForOperation('permissions.deleteItemPermission', grant('delete')))
            .toEqual(['deletePermissions']);
    });
});

test.describe('AC-15 — the authorization matrix is complete and explicit', () => {
    test('every operation named in the protocol allow-list is gated by the matrix', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'src', 'services', 'StorageExplorer', 'protocol.ts'),
            'utf8'
        );
        const start = source.indexOf('export interface StorageExplorerOperations {');
        expect(start, 'the protocol allow-list must exist').toBeGreaterThan(-1);
        const end = source.indexOf('\n}', start);
        const body = source.slice(start, end);

        const declared = [...body.matchAll(/^\s{4}'([a-zA-Z]+\.[a-zA-Z]+)':/gm)].map((match) => match[1]);
        expect(declared.length, 'the allow-list parse found no operations').toBeGreaterThan(20);

        const ungoverned = declared.filter(
            (operation) => !(operation in OPERATION_REQUIRED_CAPABILITIES)
        );
        expect(ungoverned, 'these operations would reach Graph without an authorization decision')
            .toEqual([]);
    });

    test('every matrix entry requires only real capabilities', () => {
        const unknown: string[] = [];
        for (const [operation, required] of Object.entries(OPERATION_REQUIRED_CAPABILITIES)) {
            for (const capability of required) {
                if (!KNOWN_CAPABILITIES.includes(capability)) {
                    unknown.push(`${operation} -> ${capability}`);
                }
            }
        }
        expect(unknown, 'a capability the calculation never produces can never be satisfied').toEqual([]);
    });

    test('only authorization discovery, directory, and signed-in-user operations are ungated', () => {
        const ungated = (Object.keys(OPERATION_REQUIRED_CAPABILITIES) as StorageExplorerOperation[])
            .filter((operation) => requiredCapabilitiesForOperation(operation).length === 0);

        expect(ungated.sort()).toEqual([...UNGATED].sort());
    });

    test('continuing a listing is gated as a read', () => {
        // Load more must not be a hole in the matrix: it returns container or file data.
        expect(requiredCapabilitiesForOperation('collections.loadMore')).toEqual(['read']);
        expect(missingCapabilitiesForOperation('collections.loadMore', grant('create', 'write'))).toEqual(['read']);
        expect(missingCapabilitiesForOperation('collections.loadMore', grant('read'))).toEqual([]);
    });

    test('read-shaped operations require read, and never a write scope', () => {
        for (const operation of [
            'containers.list', 'containers.get', 'containers.listDeleted', 'containers.getSettings',
            'drive.listChildren', 'drive.listRecycleBin', 'drive.listVersions', 'columns.listContainerColumns',
        ] as StorageExplorerOperation[]) {
            expect(requiredCapabilitiesForOperation(operation), `${operation} must require read`).toEqual(['read']);
            expect(missingCapabilitiesForOperation(operation, grant('read'))).toEqual([]);
        }
    });

    test('destructive operations require delete, and read alone never suffices', () => {
        for (const operation of [
            'containers.delete', 'containers.permanentlyDelete',
            'drive.delete', 'drive.permanentlyDelete', 'drive.deleteVersion',
        ] as StorageExplorerOperation[]) {
            expect(missingCapabilitiesForOperation(operation, grant('read', 'write', 'create')))
                .toEqual(['delete']);
        }
    });

    test('content operations are separated from metadata operations', () => {
        // Reading a file's bytes is a different grant from listing it.
        expect(missingCapabilitiesForOperation('drive.getDownloadUrl', grant('read'))).toEqual(['readContent']);
        expect(missingCapabilitiesForOperation('drive.getItemWebUrl', grant('read'))).toEqual([]);
        expect(missingCapabilitiesForOperation('drive.createFile', grant('read', 'write'))).toEqual(['writeContent']);
        expect(missingCapabilitiesForOperation('drive.createUploadSession', grant('read', 'write'))).toEqual(['writeContent']);
    });

    test('every permission operation is satisfied by managePermissions alone', () => {
        const permissionOperations = (Object.keys(OPERATION_REQUIRED_CAPABILITIES) as StorageExplorerOperation[])
            .filter((operation) => operation.startsWith('permissions.'));
        expect(permissionOperations.length).toBeGreaterThan(5);

        for (const operation of permissionOperations) {
            expect(missingCapabilitiesForOperation(operation, grant('managePermissions')), `${operation}`)
                .toEqual([]);
            expect(
                missingCapabilitiesForOperation(operation, grant('read', 'write', 'create', 'delete')).length,
                `${operation} must not be reachable without a permission grant`
            ).toBeGreaterThan(0);
        }
    });

    test('a missing-capability report names scopes only', () => {
        const missing = missingCapabilitiesForOperation('containers.create', grant('read'));

        expect(missing).toEqual(['create']);
        // The report crosses the boundary to the webview, so it must be free of grant detail.
        expect(JSON.stringify(missing)).not.toContain('applicationPermissionGrants');
        expect(JSON.stringify(missing)).not.toContain('appId');
    });
});
