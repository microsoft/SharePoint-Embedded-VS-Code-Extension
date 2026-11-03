/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import { openStorageExplorer } from '../helpers/mock/harness';
import { seedState } from '../helpers/graphMock';

const SEED_CONTAINER = 'Seed Container';
const SEED_FILE = 'File 2.docx';

/** File-scoped side panels: open each tab for a selected file and assert it renders. */
test.describe('File side panels', () => {
    test('properties panel renders for a file', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await storage.openItemTab(SEED_FILE, 'properties');
        await expect(storage.tid('properties-panel')).toBeVisible({ timeout: 30_000 });
    });

    test.describe('File metadata dates', () => {
        test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });

        const cases = [
            {
                name: 'renders UTC and offset timestamps in local time',
                fields: {
                    Created: '2024-01-02T15:04:05.123Z',
                    Modified: '2024-06-03T18:30:45+02:00',
                    DueDate: '2024-01-02T00:00:00Z',
                },
                expected: {
                    Created: '1/2/2024, 7:04:05 AM',
                    Modified: '6/3/2024, 9:30:45 AM',
                    DueDate: '1/1/2024',
                },
            },
            {
                name: 'preserves date-only values and accepts local timestamps',
                fields: {
                    Created: '2024-01-02',
                    Modified: '2024-06-03T18:30:45',
                    DueDate: '2024-01-02',
                },
                expected: {
                    Created: '1/2/2024, 12:00:00 AM',
                    Modified: '6/3/2024, 6:30:45 PM',
                    DueDate: '1/2/2024',
                },
            },
            {
                name: 'preserves invalid date text instead of displaying Invalid Date',
                fields: { Created: 'invalid-created', Modified: 'invalid-modified', DueDate: 'invalid-date' },
                expected: { Created: 'invalid-created', Modified: 'invalid-modified', DueDate: 'invalid-date' },
            },
        ];

        for (const scenario of cases) {
            test(scenario.name, async ({ page }) => {
                const state = seedState({ containers: 0 });
                const container = state.addContainer(SEED_CONTAINER);
                const file = state.addDriveItem(container.id, { name: SEED_FILE });
                const columns = [
                    { id: 'created', name: 'Created', displayName: 'Created', isDeletable: false, dateTime: { format: 'dateTime' } },
                    { id: 'modified', name: 'Modified', displayName: 'Modified', isDeletable: false, dateTime: { format: 'dateTime' } },
                    { id: 'due', name: 'DueDate', displayName: 'Due date', dateTime: { format: 'dateOnly' } },
                ];
                state.columns.set(container.id, columns);
                state.itemFields.set(file.id, scenario.fields);

                const { view } = await openStorageExplorer(page, state);
                await view.openContainer(SEED_CONTAINER);
                await view.openItemTab(SEED_FILE, 'metadata');

                for (const [field, expected] of Object.entries(scenario.expected)) {
                    await expect(view.tid(`metadata-row-${field}`)).toContainText(expected);
                }
            });
        }
    });

    test('versions tab is reachable for a file', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await storage.openItemTab(SEED_FILE, 'versions');
        await expect(storage.sidePanelTab('versions')).toBeVisible({ timeout: 30_000 });
    });

    test('metadata formats built-in file sizes without changing custom text fields', async ({ page }) => {
        const state = seedState({ containers: 0 });
        const container = state.addContainer(SEED_CONTAINER);
        const columns = [
            { id: 'size', name: 'FileSizeDisplay', displayName: 'File Size', isDeletable: false, text: {} },
            { id: 'legacy-size', name: 'File_x0020_Size', displayName: 'File Size', isDeletable: false, text: {} },
            { id: 'custom-size', name: 'CustomSize', displayName: 'Custom size', text: {} },
        ];
        state.columns.set(container.id, columns);
        const cases = [
            { value: '0', expected: '0 B' },
            { value: '512', expected: '512 B' },
            { value: '1024', expected: '1 KB' },
            { value: '150000000', expected: '143.1 MB' },
            { value: '1073741824', expected: '1 GB' },
            { value: '1099511627776', expected: '1 TB' },
            { value: 'invalid-size', expected: 'invalid-size' },
            { value: '-1', expected: '-1' },
            { value: '9007199254740992', expected: '9007199254740992' },
        ];
        for (const [index, scenario] of cases.entries()) {
            const file = state.addDriveItem(container.id, { name: `size-${index}.bin` });
            state.itemFields.set(file.id, {
                FileSizeDisplay: scenario.value,
                File_x0020_Size: scenario.value,
                CustomSize: scenario.value,
            });
        }

        const { view } = await openStorageExplorer(page, state);
        await view.openContainer(SEED_CONTAINER);
        for (const [index, scenario] of cases.entries()) {
            await view.openItemTab(`size-${index}.bin`, 'metadata');
            await expect(view.tid('metadata-row-FileSizeDisplay')).toContainText(scenario.expected);
            await expect(view.tid('metadata-row-File_x0020_Size')).toContainText(scenario.expected);
            await expect(view.tid('metadata-row-CustomSize')).toContainText(scenario.value);
        }
    });

    test('permissions tab is reachable for a file', async ({ storage }) => {
        await storage.openContainer(SEED_CONTAINER);
        await storage.openItemTab(SEED_FILE, 'permissions');
        await expect(storage.sidePanelTab('permissions')).toBeVisible({ timeout: 30_000 });
    });
});
