/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Development tree contributions (AC-10, AC-11, AC-13).
 *
 * The legacy Containers / Recycled Containers child views and their tree-only actions must be
 * gone, and the single Storage Explorer entry must be offered for *every* container type —
 * including unregistered ones, which is the entry point of the guided onboarding flow.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface MenuEntry { command?: string; when?: string; group?: string }
interface CommandEntry { command: string; title: string }
interface PackageJson {
    contributes: {
        commands: CommandEntry[];
        menus: Record<string, MenuEntry[]>;
    };
}

const ROOT = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')) as T;
}

const pkg = readJson<PackageJson>('package.json');
const nls = readJson<Record<string, string>>('package.nls.json');

const allMenus: MenuEntry[] = Object.values(pkg.contributes.menus).flat();
const treeMenus: MenuEntry[] = pkg.contributes.menus['view/item/context'] ?? [];

const LEGACY_CONTEXT_VALUES = [
    'spe:containersTreeItem',
    'spe:containerTreeItem',
    'spe:recycledContainersTreeItem',
    'spe:recycledContainerTreeItem',
];

test.describe('AC-10 — legacy container tree nodes are gone', () => {
    for (const contextValue of LEGACY_CONTEXT_VALUES) {
        test(`no menu targets ${contextValue}`, () => {
            const offenders = allMenus.filter((m) => (m.when ?? '').includes(contextValue));
            expect(
                offenders.map((m) => m.command ?? '(no command)'),
                `${contextValue} must no longer be reachable from the Development tree`
            ).toEqual([]);
        });
    }

    test('tree-only container and recycled-container actions are not contributed to the tree', () => {
        const offenders = treeMenus
            .map((m) => m.command ?? '')
            .filter((command) => /^spe\.(Container|Containers|RecycledContainer|RecycledContainers)\./.test(command));
        expect(offenders, 'these actions belonged to the removed container tree nodes').toEqual([]);
    });
});

test.describe('AC-10 / AC-13 — a single Storage Explorer entry per container type', () => {
    const openCommand = 'spe.ContainerType.openStorageExplorer';

    test('the Storage Explorer command is still contributed', () => {
        const commands = pkg.contributes.commands.filter((c) => c.command === openCommand);
        expect(commands).toHaveLength(1);
        expect(commands[0].title).toMatch(/^%.+%$/);
    });

    test('the Storage Explorer entry is reachable for unregistered container types', () => {
        const entries = allMenus.filter((m) => m.command === openCommand);
        expect(entries.length, 'the Storage Explorer entry must be contributed').toBeGreaterThan(0);

        // AC-11/AC-12: an unregistered or ungranted container type must still *show* the entry
        // (muted, with guidance) rather than hide it, so no `when` may require readiness.
        for (const entry of entries) {
            const when = entry.when ?? '';
            expect(when, 'the entry must not be hidden on unregistered container types').not.toContain('-registered');
            expect(when, 'the entry must not be hidden when the grant is missing').not.toContain('extensionPermissionsGranted');
        }
    });
});

test.describe('AC-11 — user-facing strings are localized', () => {
    test('every contributed command title resolves in package.nls.json', () => {
        const missing = pkg.contributes.commands
            .map((c) => c.title)
            .filter((title) => /^%.+%$/.test(title))
            .map((title) => title.slice(1, -1))
            .filter((key) => !(key in nls));
        expect(missing, 'command titles must have an nls entry').toEqual([]);
    });
});
