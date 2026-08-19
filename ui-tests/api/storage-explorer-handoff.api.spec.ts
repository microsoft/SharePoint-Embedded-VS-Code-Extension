/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The post-setup hand-off into Storage Explorer (AC-13).
 *
 * Registering on the local tenant and granting the extension app its delegated permissions are
 * two independent steps, and a user may do either first. Whichever one completes the pair has
 * to leave the user *in* Storage Explorer — refreshing the Development tree first, so VS Code
 * cannot keep rendering "register to use" on a container type that is about to open.
 *
 * The failure modes that matter: opening a panel that is still blocked (the user lands on an
 * inert surface), opening twice (a duplicate or stolen-focus panel), refreshing after the open
 * (a stale row behind a ready panel), and throwing when the registration lookup fails (the
 * grant itself succeeded, so the command must not report failure).
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

import { test, expect } from '@playwright/test';
import { installVscodeStub } from '../helpers/mock/vscodeStub';
import { mockModuleFor } from '../helpers/mock/moduleStub';

installVscodeStub();

const HANDOFF = 'commands/ContainerType/StorageExplorerHandoff.ts';

/** Ordered log of the host-visible effects, so "refresh before open" is observable. */
const effects: string[] = [];
/** Every `StorageExplorerPanel.open(...)` argument list, in order. */
const opens: unknown[][] = [];
/** Registration lookups the hand-off performed, by container type id. */
const lookups: string[] = [];

let lookupResult: { kind: 'registration'; value: any } | { kind: 'error'; error: Error } = {
    kind: 'error',
    error: new Error('not registered'),
};
let permissionsGranted = false;
/** Container type ids `hasExtensionAppPermissions` was asked about. */
const permissionChecks: string[] = [];

mockModuleFor(HANDOFF, 'views/treeview/development/DevelopmentTreeViewProvider', {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
    DevelopmentTreeViewProvider: {
        getInstance: () => ({ refresh: () => { effects.push('refresh'); } }),
    },
});

mockModuleFor(HANDOFF, 'services/Graph/GraphProvider', {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
    GraphProvider: {
        getInstance: () => ({
            registrations: {
                get: async (containerTypeId: string) => {
                    lookups.push(containerTypeId);
                    if (lookupResult.kind === 'error') { throw lookupResult.error; }
                    return lookupResult.value;
                },
            },
        }),
    },
});

mockModuleFor(HANDOFF, 'utils/ExtensionAppPermissions', {
    hasExtensionAppPermissions: async (containerTypeId: string) => {
        permissionChecks.push(containerTypeId);
        return permissionsGranted;
    },
});

mockModuleFor(HANDOFF, 'views/StorageExplorer/StorageExplorerPanel', {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
    StorageExplorerPanel: {
        open: async (...args: unknown[]) => {
            effects.push('open');
            opens.push(args);
        },
    },
});

const { openStorageExplorerWhenReady } = require('../../src/commands/ContainerType/StorageExplorerHandoff');

const CONTAINER_TYPE: any = {
    id: 'ct-guid-1',
    name: 'Contoso Documents',
    owningAppId: 'app-1',
    billingClassification: 'trial',
    billingStatus: 'valid',
};

const REGISTRATION: any = {
    id: 'reg-1',
    containerTypeId: CONTAINER_TYPE.id,
    tenantId: 'tenant-1',
    billingStatus: 'valid',
};

test.beforeEach(() => {
    effects.length = 0;
    opens.length = 0;
    lookups.length = 0;
    permissionChecks.length = 0;
    lookupResult = { kind: 'error', error: new Error('not registered') };
    permissionsGranted = false;
});

test.describe('AC-13 — registration-first reaches Storage Explorer once the grant lands', () => {
    test('registering while the grant is still missing refreshes the tree but opens nothing', async () => {
        // Step one of two: `RegisterOnLocalTenant` hands the fresh registration over directly.
        const opened = await openStorageExplorerWhenReady(CONTAINER_TYPE, REGISTRATION);

        expect(opened, 'a missing grant is not ready').toBe(false);
        expect(opens, 'opening here would strand the user on a blocked panel').toEqual([]);
        expect(effects, 'the tree still has to re-render the row that names the next step')
            .toEqual(['refresh']);
    });

    test('the grant completing the pair opens Storage Explorer exactly once', async () => {
        lookupResult = { kind: 'registration', value: REGISTRATION };
        permissionsGranted = true;

        // Step two: `GrantExtensionAppPermissions` knows no registration, so the host resolves it.
        const opened = await openStorageExplorerWhenReady(CONTAINER_TYPE);

        expect(opened).toBe(true);
        expect(opens).toHaveLength(1);
        expect(effects, 'a panel must never be revealed behind a stale tree row')
            .toEqual(['refresh', 'open']);
    });
});

test.describe('AC-13 — permission-first reaches Storage Explorer once registration lands', () => {
    test('granting before registering refreshes without opening, and does not report failure', async () => {
        permissionsGranted = true;
        lookupResult = { kind: 'error', error: new Error('itemNotFound') };

        const opened = await openStorageExplorerWhenReady(CONTAINER_TYPE);

        expect(opened, 'there is nothing to open until the container type is registered').toBe(false);
        expect(opens).toEqual([]);
        expect(effects).toEqual(['refresh']);
        expect(lookups, 'the registration has to be resolved before readiness can be decided')
            .toEqual([CONTAINER_TYPE.id]);
    });

    test('registering afterwards opens Storage Explorer exactly once', async () => {
        permissionsGranted = true;

        const opened = await openStorageExplorerWhenReady(CONTAINER_TYPE, REGISTRATION);

        expect(opened).toBe(true);
        expect(opens).toHaveLength(1);
        expect(effects).toEqual(['refresh', 'open']);
        expect(lookups, 'a caller-supplied registration must not trigger a redundant Graph call')
            .toEqual([]);
    });
});

test.describe('AC-13 — the hand-off carries the ready state and refuses blocked ones', () => {
    test('the panel is opened for this container type, its registration, and a ready readiness', async () => {
        permissionsGranted = true;

        await openStorageExplorerWhenReady(CONTAINER_TYPE, REGISTRATION);

        expect(opens[0][0]).toBe(CONTAINER_TYPE);
        expect(opens[0][1]).toBe(REGISTRATION);
        expect(opens[0][2], 'opening with anything but "ready" would render the blocked surface')
            .toBe('ready');
    });

    test('a billing-blocked container type is refreshed, never opened', async () => {
        permissionsGranted = true;
        const unbilled = { ...CONTAINER_TYPE, billingClassification: 'standard', billingStatus: 'invalid' };

        const opened = await openStorageExplorerWhenReady(unbilled as any, REGISTRATION);

        expect(opened).toBe(false);
        expect(opens).toEqual([]);
        expect(effects).toEqual(['refresh']);
    });

    test('a registration whose billing is invalid is not treated as ready', async () => {
        permissionsGranted = true;

        const opened = await openStorageExplorerWhenReady(
            CONTAINER_TYPE,
            { ...REGISTRATION, billingStatus: 'invalid' } as any
        );

        expect(opened).toBe(false);
        expect(opens).toEqual([]);
    });

    test('an unregistered container type never checks the grant it cannot use', async () => {
        lookupResult = { kind: 'error', error: new Error('itemNotFound') };

        const opened = await openStorageExplorerWhenReady(CONTAINER_TYPE);

        expect(opened).toBe(false);
        expect(permissionChecks, 'a grant lookup on a container type with no registration is wasted work')
            .toEqual([]);
    });

    test('a failed registration lookup is reported as "not opened", not thrown', async () => {
        // The grant itself succeeded; surfacing this transient failure as a command error would
        // tell the user their successful step failed.
        permissionsGranted = true;
        lookupResult = { kind: 'error', error: new Error('503 service unavailable') };

        const opened = await openStorageExplorerWhenReady(CONTAINER_TYPE);

        expect(opened).toBe(false);
        expect(opens).toEqual([]);
        expect(effects).toEqual(['refresh']);
    });

    test('repeating the hand-off in a ready state defers to the panel rather than duplicating logic', async () => {
        permissionsGranted = true;

        await openStorageExplorerWhenReady(CONTAINER_TYPE, REGISTRATION);
        await openStorageExplorerWhenReady(CONTAINER_TYPE, REGISTRATION);

        // Two hand-offs, two `open` calls — de-duplication is `StorageExplorerPanel.open`'s job
        // (it reveals the existing panel), and each call must be a full refresh-then-open.
        expect(effects).toEqual(['refresh', 'open', 'refresh', 'open']);
        for (const call of opens) {
            expect(call[2]).toBe('ready');
        }
    });
});
