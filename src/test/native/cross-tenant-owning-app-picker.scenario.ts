/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from '@playwright/test';
import * as sinon from 'sinon';
import { GetOrCreateApp } from '../../commands/Apps/GetOrCreateApp';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
    const app = { appId: 'cccccccc-0000-4000-8000-000000000001', displayName: 'Partner Documents' };
    const sandbox = sinon.createSandbox();
    try {
        const graph = GraphProvider.getInstance();
        sandbox.stub(AuthenticationState, 'getCurrentAccount').resolves({
            id: 'offline-user', username: 'developer@example.test', domain: 'example.test', tenantId
        });
        sandbox.stub(graph.containerTypes, 'list').resolves([]);
        sandbox.stub(graph.applications, 'list').resolves({ applications: [] });
        const listCrossTenantApps = sandbox.stub(graph.applications, 'listCrossTenantApplications').resolves([app]);

        await captureWorkbench(async workbench => {
            void GetOrCreateApp.run(true);
            const picker = workbench.locator('.quick-input-widget');
            await picker.getByText('Select an app from another tenant...', { exact: true }).click({ timeout: 10_000 });
            await expect(picker.getByText('Select an owning app from another tenant', { exact: true })).toBeVisible();
            const result = picker.locator('.monaco-list-row')
                .filter({ has: workbench.getByText(app.displayName, { exact: true }) });
            await expect(result.getByText(app.appId, { exact: true })).toBeVisible();
            sinon.assert.calledOnceWithExactly(listCrossTenantApps, tenantId);
            return result;
        });
    } finally {
        sandbox.restore();
    }
}
