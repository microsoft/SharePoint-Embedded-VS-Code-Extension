/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Storage Explorer tree entry and its readiness states (AC-10, AC-11, AC-12).
 *
 * The entry replaces the legacy `Containers` / `Recycled containers` sub-trees, so it is the
 * only Storage Explorer affordance in the Development tree. It must therefore be present for
 * *every* container type — a container type that is not ready yet is precisely the one whose
 * user needs to be told what to do next. "Not ready" is communicated by a stable context
 * value, a muted or warned icon, a description, and a tooltip that names the next action; it
 * is never communicated by hiding the row.
 */

import { test, expect } from '@playwright/test';
import { installVscodeStub, StubMarkdownString, StubThemeIcon } from '../helpers/mock/vscodeStub';

// The stub has to be in place before the tree item module is loaded, so the unit under test is
// pulled in with a lazy `require` below rather than a hoisted `import`.
const vscode = installVscodeStub();

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { StorageExplorerTreeItem } = require('../../src/views/treeview/development/StorageExplorerTreeItem');
/* eslint-enable @typescript-eslint/no-var-requires */

type Readiness = 'ready' | 'unregistered' | 'missingPermissions' | 'billingBlocked';

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

function build(readiness: Readiness, registration: any = readiness === 'unregistered' ? null : REGISTRATION): any {
    return new StorageExplorerTreeItem(CONTAINER_TYPE, registration, readiness);
}

const ALL_STATES: Readiness[] = ['ready', 'unregistered', 'missingPermissions', 'billingBlocked'];
const BLOCKED_STATES: Readiness[] = ['unregistered', 'missingPermissions', 'billingBlocked'];

/** The colour a themed icon was tinted with, or undefined when it uses the default foreground. */
function iconColorId(item: any): string | undefined {
    expect(item.iconPath, 'the entry must always carry an icon').toBeInstanceOf(StubThemeIcon);
    return (item.iconPath as StubThemeIcon).color?.id;
}

function tooltipText(item: any): string {
    expect(item.tooltip, 'the entry must always carry a tooltip').toBeInstanceOf(StubMarkdownString);
    return (item.tooltip as StubMarkdownString).value;
}

test.describe('AC-11 — the entry is always present and always says which state it is in', () => {
    for (const readiness of ALL_STATES) {
        test(`${readiness}: renders a labelled, non-expandable, clickable row`, () => {
            const item = build(readiness);

            expect(item.label).toBe('Storage Explorer');
            expect(item.collapsibleState, 'the entry has no children of its own')
                .toBe(vscode.TreeItemCollapsibleState.None);
            expect(item.id, 'the row id must be stable per container type').toContain(CONTAINER_TYPE.id);
            expect(typeof tooltipText(item)).toBe('string');
            expect(tooltipText(item).length, 'an empty tooltip explains nothing').toBeGreaterThan(0);
        });

        test(`${readiness}: exposes a stable, state-specific context value`, () => {
            const item = build(readiness);

            expect(item.contextValue).toBe(`spe:storageExplorerTreeItem-${readiness}`);
        });

        test(`${readiness}: clicking opens Storage Explorer and passes the row itself`, () => {
            const item = build(readiness);

            // Blocked states still open: the panel renders the onboarding surface (AC-12) and
            // makes no collection request, which is more useful than an inert row.
            expect(item.command?.command).toBe('spe.ContainerType.openStorageExplorer');
            expect(item.command?.title?.length ?? 0).toBeGreaterThan(0);
            expect(item.command?.arguments?.[0], 'the handler needs the readiness it was built with')
                .toBe(item);
        });
    }

    test('every readiness state is distinguishable by context value alone', () => {
        const contextValues = ALL_STATES.map((readiness) => build(readiness).contextValue);

        expect(new Set(contextValues).size, 'menu `when` clauses cannot tell these states apart')
            .toBe(ALL_STATES.length);
    });

    test('a ready container type is presented plainly, with no warning treatment', () => {
        const item = build('ready');

        expect(item.description, 'a ready entry needs no annotation').toBeFalsy();
        expect(iconColorId(item), 'a ready entry must not be muted or warned').toBeUndefined();
        expect(tooltipText(item)).toContain('Storage Explorer');
    });

    for (const readiness of BLOCKED_STATES) {
        test(`${readiness}: is visibly annotated rather than silently absent`, () => {
            const item = build(readiness);

            expect(String(item.description ?? ''), `${readiness} must carry a visible description`)
                .not.toHaveLength(0);
            expect(
                iconColorId(item),
                `${readiness} must be muted or warned so the row does not look ready`
            ).toBeTruthy();
        });
    }

    test('unregistered points at registration, and nothing else', () => {
        const tooltip = tooltipText(build('unregistered'));

        expect(tooltip).toMatch(/register/i);
        expect(tooltip, 'a missing registration must not be reported as a permission problem')
            .not.toMatch(/grant extension app permissions/i);
        expect(iconColorId(build('unregistered'))).toBe('disabledForeground');
    });

    test('missingPermissions points at the extension-app grant, and nothing else', () => {
        const item = build('missingPermissions');
        const tooltip = tooltipText(item);

        expect(tooltip).toMatch(/permission/i);
        expect(tooltip, 'a registered container type must not be told to register')
            .not.toMatch(/register on local tenant/i);
        expect(iconColorId(item), 'a fixable permission gap is a warning, not a disabled row')
            .toBe('list.warningForeground');
        // The grant document, app ids and tenant ids are host-only detail.
        expect(tooltip).not.toContain(REGISTRATION.tenantId);
        expect(tooltip).not.toContain(CONTAINER_TYPE.owningAppId);
    });

    test('billingBlocked points at billing, and nothing else', () => {
        const tooltip = tooltipText(build('billingBlocked'));

        expect(tooltip).toMatch(/billing/i);
        expect(tooltip, 'billing is the blocker; naming registration would send the user astray')
            .not.toMatch(/register on local tenant/i);
    });

    test('each state gives a different explanation', () => {
        const tooltips = ALL_STATES.map((readiness) => tooltipText(build(readiness)));

        expect(new Set(tooltips).size, 'a shared generic tooltip names no next action')
            .toBe(ALL_STATES.length);
    });

    test('the entry survives a container type with no registration at all', () => {
        // Guided onboarding starts here: a brand-new container type has no registration object,
        // and constructing the row must not throw.
        const item = build('unregistered', null);

        expect(item.contextValue).toBe('spe:storageExplorerTreeItem-unregistered');
        expect(item.registration).toBeNull();
        expect(item.command?.command).toBe('spe.ContainerType.openStorageExplorer');
    });

    test('the row carries the readiness forward so the panel can render the right surface', () => {
        for (const readiness of ALL_STATES) {
            expect(build(readiness).readiness, 'AC-12 depends on this reaching the open command')
                .toBe(readiness);
        }
    });
});
