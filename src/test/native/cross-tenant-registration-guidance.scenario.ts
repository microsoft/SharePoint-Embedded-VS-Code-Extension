/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from '@playwright/test';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { runTrialFlow } from '../../commands/ContainerTypes/CreateTrialContainerType';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const displayName = 'PartnerDocuments';
    const tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
    const app = {
        appId: 'cccccccc-0000-4000-8000-000000000001', displayName: 'Partner Documents', isCrossTenant: true as const
    };
    const containerType = {
        id: 'new-container-type', name: displayName, owningAppId: app.appId,
        billingClassification: 'trial' as const, billingStatus: 'valid' as const, settings: { isDiscoverabilityEnabled: false }
    };
    const sandbox = sinon.createSandbox();
    try {
        const graph = GraphProvider.getInstance();
        sandbox.stub(AuthenticationState, 'isSignedIn').resolves(true);
        sandbox.stub(AuthenticationState, 'getCurrentAccount').resolves({
            id: 'offline-user', username: 'developer@example.test', domain: 'example.test',
            tenantId
        });
        const create = sandbox.stub(graph.containerTypes, 'create').resolves(containerType);
        sandbox.stub(graph.applications, 'get').resolves(null);
        sandbox.stub(graph.applications, 'getServicePrincipal').resolves({
            id: 'dddddddd-0000-4000-8000-000000000001', appId: app.appId,
            servicePrincipalType: 'Application', appOwnerOrganizationId: 'bbbbbbbb-0000-4000-8000-000000000001',
            accountEnabled: true
        });
        let registered = false;
        sandbox.stub(graph.registrations, 'get').callsFake(async () => registered ? containerType : null);
        const register = sandbox.stub(graph.registrations, 'register').callsFake(async () => {
            registered = true;
            return containerType;
        });
        sandbox.stub(graph.appPermissionGrants, 'get').resolves(null);
        const tree = DevelopmentTreeViewProvider.instance;
        sandbox.stub(tree, 'refresh');
        sandbox.stub(tree, 'getChildren').resolves([new vscode.TreeItem(displayName)]);
        sandbox.stub(TelemetryProvider.instance, 'send').resolves();

        await captureWorkbench(async workbench => {
            const creating = runTrialFlow({ displayName, app });
            const toastWithMessage = (message: string) => workbench.locator('.notifications-toasts .notification-list-item')
                .filter({ has: workbench.getByText(message, { exact: true }) });
            const offer = toastWithMessage(`Container type "${displayName}" was created. Register it in tenant ${tenantId}?`);
            await expect(offer.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
            await offer.getByRole('button', { name: 'Register in this tenant', exact: true }).click();
            await toastWithMessage('Grant the SharePoint Embedded extension permissions to perform container operations on this container type?')
                .getByRole('button', { name: 'Skip', exact: true }).click();
            const success = toastWithMessage(`Container type "${displayName}" registered successfully!`);
            await expect(success).toBeVisible();
            expect(await creating).toEqual(containerType);
            sinon.assert.calledOnce(create);
            sinon.assert.calledOnceWithExactly(register, containerType.id, {
                applicationPermissionGrants: [{ appId: app.appId, delegatedPermissions: ['full'], applicationPermissions: ['full'] }]
            });
            return success;
        });
    } finally {
        sandbox.restore();
    }
}
