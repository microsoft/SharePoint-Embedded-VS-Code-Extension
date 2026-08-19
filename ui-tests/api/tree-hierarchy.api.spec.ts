/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Development tree hierarchy under a container type (AC-10).
 *
 * `tree-contributions.api.spec.ts` proves the *menus* no longer target the removed container
 * nodes. That is not enough on its own: a `Containers` / `Recycled containers` row could still
 * be produced by the tree and simply carry no context menu. This suite asserts the shape the
 * user actually sees — one Storage Explorer entry directly under every container type,
 * registered or not, and no legacy container sub-trees.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

import { test, expect } from '@playwright/test';
import { installVscodeStub } from '../helpers/mock/vscodeStub';
import { mockModuleFor } from '../helpers/mock/moduleStub';

const vscode = installVscodeStub();

const PARENT = 'development/ContainerTypeTreeItem.ts';

/**
 * The sibling rows are stood in for so this suite fails on the *hierarchy* rather than on a
 * transitive singleton (the owning-app and registration rows reach for Graph/auth state).
 * The Storage Explorer row is deliberately left real — it is the row under test.
 */
class StubOwningAppTreeItem {
    public contextValue = 'spe:owningAppTreeItem';
    public label = 'Owning application';
    public constructor(public readonly containerType: any, public readonly parent: any) { }
}

class StubLocalRegistrationTreeItem {
    public contextValue = 'spe:localRegistrationTreeItem';
    public label = 'Local registration';
    public constructor(
        public readonly containerType: any,
        public readonly registration: any,
        public readonly billingInvalid: boolean
    ) { }
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
mockModuleFor(PARENT, 'OwningAppTreeItem', { OwningAppTreeItem: StubOwningAppTreeItem });
// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
mockModuleFor(PARENT, 'LocalRegistrationTreeItem', { LocalRegistrationTreeItem: StubLocalRegistrationTreeItem });
mockModuleFor(PARENT, 'utils/Logger', {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
    Logger: new Proxy({}, {
        get: () => () => new Proxy({}, { get: () => () => undefined }),
    }),
});
mockModuleFor(PARENT, 'BillingDecorationProvider', {
    blockBillingInvalid: () => undefined,
    tintBillingInvalid: () => undefined,
});

const { ContainerTypeTreeItem } = require('../../src/views/treeview/development/ContainerTypeTreeItem');
const { StorageExplorerTreeItem } = require('../../src/views/treeview/development/StorageExplorerTreeItem');

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

/** Context values the removed `Containers` / `Recycled containers` sub-trees used to carry. */
const LEGACY_CONTEXT_VALUES = [
    'spe:containersTreeItem',
    'spe:containerTreeItem',
    'spe:recycledContainersTreeItem',
    'spe:recycledContainerTreeItem',
];

async function childrenOf(registration: any, hasExtensionPermissions: boolean): Promise<any[]> {
    const item = new ContainerTypeTreeItem(CONTAINER_TYPE, registration, hasExtensionPermissions);
    return item.getChildren();
}

const CASES: [string, any, boolean][] = [
    ['a ready container type', REGISTRATION, true],
    ['a registered container type with no grant', REGISTRATION, false],
    ['an unregistered container type', null, false],
    ['an unregistered container type that somehow reports a grant', null, true],
];

test.describe('AC-10 — no container type offers the legacy container sub-trees', () => {
    for (const [label, registration, granted] of CASES) {
        test(`${label} produces no Containers or Recycled containers row`, async () => {
            const children = await childrenOf(registration, granted);

            const offenders = children.filter((child) =>
                LEGACY_CONTEXT_VALUES.includes(String(child.contextValue ?? ''))
                || /^(containers|recycled containers)$/i.test(String(child.label ?? ''))
            );
            expect(
                offenders.map((child) => String(child.label ?? child.contextValue)),
                'these rows were replaced by the single Storage Explorer entry'
            ).toEqual([]);
        });
    }
});

test.describe('AC-10 — exactly one Storage Explorer entry per container type', () => {
    for (const [label, registration, granted] of CASES) {
        test(`${label} offers the entry`, async () => {
            const children = await childrenOf(registration, granted);

            const entries = children.filter((child) => child instanceof StorageExplorerTreeItem);
            expect(entries, `${label} must expose Storage Explorer exactly once`).toHaveLength(1);
            expect(entries[0].label).toBe('Storage Explorer');
            expect(
                entries[0].collapsibleState,
                'the entry opens a panel; it must not look like an expandable sub-tree'
            ).toBe(vscode.TreeItemCollapsibleState.None);
        });
    }

    test('the entry is the last row, after the owning app and any registration', async () => {
        const registered = await childrenOf(REGISTRATION, true);

        expect(registered).toHaveLength(3);
        expect(registered[0]).toBeInstanceOf(StubOwningAppTreeItem);
        expect(registered[1]).toBeInstanceOf(StubLocalRegistrationTreeItem);
        expect(registered[2]).toBeInstanceOf(StorageExplorerTreeItem);
    });

    test('an unregistered container type still lists the entry, with no registration row', async () => {
        // This is the entry point of guided onboarding: hiding the row here would leave a new
        // container type with nothing to click.
        const children = await childrenOf(null, false);

        expect(children).toHaveLength(2);
        expect(children[0]).toBeInstanceOf(StubOwningAppTreeItem);
        expect(children[1]).toBeInstanceOf(StorageExplorerTreeItem);
    });
});

test.describe('AC-10 / AC-11 — the row carries the readiness the panel needs', () => {
    const expectations: [string, any, boolean, string][] = [
        ['ready', REGISTRATION, true, 'ready'],
        ['registered without a grant', REGISTRATION, false, 'missingPermissions'],
        ['unregistered', null, false, 'unregistered'],
    ];

    for (const [label, registration, granted, readiness] of expectations) {
        test(`${label} yields the ${readiness} entry`, async () => {
            const children = await childrenOf(registration, granted);
            const entry = children.find((child) => child instanceof StorageExplorerTreeItem);

            expect(entry.readiness).toBe(readiness);
            expect(entry.contextValue).toBe(`spe:storageExplorerTreeItem-${readiness}`);
            expect(entry.command?.command).toBe('spe.ContainerType.openStorageExplorer');
        });
    }

    test('an unbilled container type is reported as billing-blocked, not as a permission gap', async () => {
        const unbilled = { ...CONTAINER_TYPE, billingClassification: 'standard', billingStatus: 'invalid' };
        const item = new ContainerTypeTreeItem(unbilled, REGISTRATION, true);
        const children = await item.getChildren();
        const entry = children.find((child: any) => child instanceof StorageExplorerTreeItem);

        expect(entry.readiness).toBe('billingBlocked');
    });
});
