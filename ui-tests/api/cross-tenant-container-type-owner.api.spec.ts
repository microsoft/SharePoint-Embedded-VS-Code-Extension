/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import type { Client } from '@microsoft/microsoft-graph-client';
import type { QuickPickItem } from 'vscode';
import { containerTypeCreateSchema, type ContainerType, type ContainerTypeRegistration } from '../../src/models/schemas';
import { contributes } from '../../package.json';
import { stubContainerTypeTreeItemDependencies } from '../helpers/mock/containerTypeTreeItem';
import { mockModuleFor } from '../helpers/mock/moduleStub';
import { installVscodeStub } from '../helpers/mock/vscodeStub';
import { FakeGraphClient } from './fakeClient';

const appPicker = 'commands/Apps/GetOrCreateApp.ts';
const trialFlow = 'commands/ContainerTypes/CreateTrialContainerType.ts';
const standardFlow = 'commands/ContainerTypes/runStandardFlow.ts';
const directToCustomerFlow = 'commands/ContainerTypes/runDirectToCustomerFlow.ts';
const registrationCommand = 'commands/ContainerType/RegisterOnLocalTenant.ts';
const billingPrompt = 'commands/ContainerTypes/promptDirectToCustomerBillingSetup.ts';
const registrationGuide = 'https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/register-api-documentation';
const registrationPath = '/storage/fileStorage/containerTypeRegistrations/new-container-type';
const currentTenant = 'aaaaaaaa-0000-4000-8000-000000000001';
const homeTenant = 'bbbbbbbb-0000-4000-8000-000000000001';
const appId = 'cccccccc-0000-4000-8000-000000000001';
const owningApplicationPath = `/applications(appId='${appId}')`;
const enterpriseApplicationPath = `/servicePrincipals(appId='${appId}')`;
const principalId = 'dddddddd-0000-4000-8000-000000000001';
const usedAppId = 'eeeeeeee-0000-4000-8000-000000000001';
const nextLink = 'https://graph.microsoft.com/v1.0/servicePrincipals?$skiptoken=second-page';
const displayName = 'PartnerDocuments';
const eligiblePrincipal = {
    id: principalId,
    appId,
    displayName: 'Partner Documents',
    appOwnerOrganizationId: homeTenant,
    servicePrincipalType: 'Application',
    signInAudience: 'AzureADMultipleOrgs'
};

const host = installVscodeStub();
const fake = new FakeGraphClient();
// ApplicationService also resolves a few known apps by the build-time extension ID.
mockModuleFor('services/Graph/ApplicationService.ts', '../../client', {
    clientId: '00000000-0000-4000-8000-000000000000'
});
const { ApplicationService } = require('../../src/services/Graph/ApplicationService') as typeof import('../../src/services/Graph/ApplicationService');
const { ContainerTypeService } = require('../../src/services/Graph/ContainerTypeService') as typeof import('../../src/services/Graph/ContainerTypeService');
const { ContainerTypeRegistrationService } = require('../../src/services/Graph/ContainerTypeRegistrationService') as typeof import('../../src/services/Graph/ContainerTypeRegistrationService');
const graph = {
    applications: new ApplicationService(fake as unknown as Client),
    containerTypes: new ContainerTypeService(fake as unknown as Client),
    registrations: new ContainerTypeRegistrationService(fake as unknown as Client)
};

class StubProgress {
    show(): void { }
    hide(): void { }
}

type Notice = { message: string; actions: string[] };
let information: Notice[];
let errors: Notice[];
let warnings: string[];
let openedUrls: string[];
let selectedAction: string | undefined;
let selectedErrorAction: string | undefined;
let signedInTenant: string;
let billedContainerTypes: string[];
let handoffs: ContainerTypeRegistration[];
let registration: ContainerTypeRegistration | null;
const notifications = {
    ...host,
    env: { openExternal: async (uri: { toString(): string }) => { openedUrls.push(uri.toString()); return true; } },
    window: {
        ...host.window,
        showInformationMessage: async (message: string, ...actions: string[]) => {
            information.push({ message, actions });
            return actions.find(action => action === selectedAction);
        },
        showErrorMessage: async (message: string, ...actions: string[]) => {
            errors.push({ message, actions });
            return actions.find(action => action === selectedErrorAction);
        },
        showWarningMessage: async (message: string) => { warnings.push(message); }
    }
};

for (const parent of [appPicker, trialFlow, standardFlow, directToCustomerFlow, registrationCommand, billingPrompt]) {
    mockModuleFor(parent, 'services/Graph/GraphProvider', { GraphProvider: { getInstance: () => graph } });
    mockModuleFor(parent, 'services/AuthenticationState', {
        AuthenticationState: {
            isSignedIn: async () => true,
            getCurrentAccount: async () => ({ tenantId: signedInTenant })
        }
    });
    mockModuleFor(parent, 'views/notifications/ProgressWaitNotification', {
        ProgressWaitNotification: StubProgress,
        // Let registration verify once; do not retry failed creation in offline fixtures.
        Timer: class {
            private expired = parent !== registrationCommand;
            get finished() {
                const expired = this.expired;
                this.expired = true;
                return expired;
            }
        }
    });
    mockModuleFor(parent, 'views/treeview/development/DevelopmentTreeViewProvider', {
        DevelopmentTreeViewProvider: { instance: { refresh: () => undefined, getChildren: async () => [{}] } }
    });
    mockModuleFor(parent, 'services/TelemetryProvider', { TelemetryProvider: { instance: { send: () => undefined } } });
    if (parent !== appPicker) {
        mockModuleFor(parent, 'vscode', notifications);
    }
}
mockModuleFor('models/telemetry/telemetry.ts', 'vscode', { ...host, env: { language: 'en' } });
mockModuleFor(registrationCommand, '../../client', { clientId: '00000000-0000-4000-8000-000000000000' });
mockModuleFor(registrationCommand, 'services/Auth/AppAuthProviderFactory', {});
stubContainerTypeTreeItemDependencies();
mockModuleFor(registrationCommand, 'utils/AdminConsentHelper', {});
mockModuleFor(registrationCommand, 'utils/ExtensionAppPermissions', {});
mockModuleFor(registrationCommand, './StorageExplorerHandoff', {
    openStorageExplorerWhenReady: async (_containerType: ContainerType, confirmed: ContainerTypeRegistration) => {
        handoffs.push(confirmed);
        return false;
    }
});
mockModuleFor(standardFlow, './attachBillingToContainerType', {
    attachBillingToContainerType: async (containerType: { id: string }) => {
        billedContainerTypes.push(containerType.id);
        return 'succeeded';
    }
});

function createOwningAppPicker() {
    let select: ((items: readonly QuickPickItem[]) => void) | undefined;
    let onHide: (() => void) | undefined;
    return {
        items: [] as QuickPickItem[],
        onDidChangeValue: () => undefined,
        onDidChangeSelection: (listener: typeof select) => { select = listener; },
        onDidHide: (listener: typeof onHide) => { onHide = listener; },
        show() {
            queueMicrotask(() => {
                const option = this.items.find(item => item.label === 'Select an app from another tenant...');
                if (option) {
                    select?.([option]);
                } else {
                    this.hide();
                }
            });
        },
        hide: () => onHide?.(),
        dispose: () => undefined
    };
}

let offeredApps: readonly QuickPickItem[];
mockModuleFor(appPicker, 'vscode', {
    ...notifications,
    QuickPickItemKind: { Separator: -1 },
    window: {
        ...notifications.window,
        createQuickPick: createOwningAppPicker,
        showQuickPick: async (items: readonly QuickPickItem[]) => {
            offeredApps = items;
            return items.find(item => item.detail === appId);
        }
    }
});

const { GetOrCreateApp } = require('../../src/commands/Apps/GetOrCreateApp') as typeof import('../../src/commands/Apps/GetOrCreateApp');
const { runTrialFlow } = require('../../src/commands/ContainerTypes/CreateTrialContainerType') as typeof import('../../src/commands/ContainerTypes/CreateTrialContainerType');
const { runStandardFlow } = require('../../src/commands/ContainerTypes/runStandardFlow') as typeof import('../../src/commands/ContainerTypes/runStandardFlow');
const { runDirectToCustomerFlow } = require('../../src/commands/ContainerTypes/runDirectToCustomerFlow') as typeof import('../../src/commands/ContainerTypes/runDirectToCustomerFlow');
const { RegisterOnLocalTenant } = require('../../src/commands/ContainerType/RegisterOnLocalTenant') as typeof import('../../src/commands/ContainerType/RegisterOnLocalTenant');
const { ContainerTypeTreeItem } = require('../../src/views/treeview/development/ContainerTypeTreeItem') as typeof import('../../src/views/treeview/development/ContainerTypeTreeItem');

const registrationResponse: ContainerTypeRegistration = {
    id: 'new-container-type', name: displayName, owningAppId: appId,
    billingClassification: 'trial', billingStatus: 'valid', settings: {}
};
const registrationSuccessMessage = `Container type "${displayName}" registered successfully!`;

function setGraphResponses(directoryError?: Error): void {
    const otherAppId = 'ffffffff-0000-4000-8000-000000000001';
    fake.responder = call => {
        if (call.path === '/storage/fileStorage/containerTypes') {
            if (call.method === 'POST') {
                const submitted = containerTypeCreateSchema.parse(call.body);
                return { ...submitted, id: 'new-container-type', billingStatus: 'valid' };
            }
            return { value: [{
                id: 'existing-container-type', name: 'Existing', owningAppId: usedAppId.toUpperCase(),
                billingClassification: 'trial', billingStatus: 'valid'
            }] };
        }
        if (call.path === '/applications') {
            return { value: [] };
        }
        if (call.path === '/servicePrincipals') {
            if (directoryError) {
                throw directoryError;
            }
            return {
                value: [
                    { ...eligiblePrincipal, appId: usedAppId, displayName: 'Already used' },
                    { ...eligiblePrincipal, appId: otherAppId, displayName: 'Single-tenant', signInAudience: 'AzureADMyOrg' },
                    { ...eligiblePrincipal, appId: otherAppId, displayName: 'Unknown audience', signInAudience: null },
                    { ...eligiblePrincipal, appId: otherAppId, displayName: 'Local', appOwnerOrganizationId: currentTenant.toUpperCase() },
                    { ...eligiblePrincipal, appId: otherAppId, displayName: 'Managed identity', servicePrincipalType: 'ManagedIdentity' },
                    { ...eligiblePrincipal, appId: otherAppId, displayName: 'Unknown tenant', appOwnerOrganizationId: null },
                    { ...eligiblePrincipal, appId: null, displayName: 'Missing app ID' }
                ],
                '@odata.nextLink': nextLink
            };
        }
        if (call.path === nextLink) {
            return { value: [eligiblePrincipal] };
        }
        if (call.path === registrationPath && call.method === 'PUT') {
            registration = registrationResponse;
            return registration;
        }
        if (call.method === 'GET') {
            if (call.path === registrationPath && registration) {
                return registration;
            }
            if (call.path === owningApplicationPath || call.path === registrationPath) {
                throw Object.assign(new Error('Not found'), { statusCode: 404 });
            }
            if (call.path === enterpriseApplicationPath) {
                return eligiblePrincipal;
            }
        }
        throw new Error(`Unexpected Graph request: ${call.method} ${call.path}`);
    };
}

test.beforeEach(() => {
    fake.reset();
    offeredApps = [];
    information = [];
    errors = [];
    warnings = [];
    openedUrls = [];
    selectedAction = undefined;
    selectedErrorAction = undefined;
    signedInTenant = currentTenant;
    billedContainerTypes = [];
    handoffs = [];
    registration = null;
});

for (const billing of ['trial', 'standard', 'directToCustomer'] as const) {
    test(`records the foreign app client ID and offers registration in the creation tenant for ${billing}`, async () => {
        setGraphResponses();
        selectedAction = 'Skip';
        const create = billing === 'standard' ? runStandardFlow : runDirectToCustomerFlow;
        const created = billing === 'trial'
            ? await runTrialFlow({ displayName })
            : await create({ displayName, app: await selectCrossTenantApp() });

        expect(offeredApps.map(item => ({ label: item.label, detail: item.detail })))
            .toEqual([{ label: eligiblePrincipal.displayName, detail: appId }]);
        const directoryCall = fake.calls.find(call => call.path === '/servicePrincipals');
        expect(directoryCall).toMatchObject({
            method: 'GET', version: 'v1.0', filter: "servicePrincipalType eq 'Application'"
        });
        expect(directoryCall?.select).toContain('signInAudience');
        expect(fake.calls.filter(call => call.method !== 'GET')).toMatchObject([{
            method: 'POST', path: '/storage/fileStorage/containerTypes', version: 'v1.0',
            body: { name: displayName, owningAppId: appId, billingClassification: billing }
        }]);
        expect(created?.owningAppId).toBe(appId);
        expect(created?.owningAppId).not.toBe(principalId);
        expect(information[0]).toEqual({
            message: `Container type "${displayName}" was created. Register it in tenant ${currentTenant}?`,
            actions: ['Register in this tenant', 'Skip']
        });
        expect(openedUrls).toEqual([]);
        expect(fake.calls.some(call => call.path === owningApplicationPath)).toBe(false);
        if (billing === 'standard') {
            expect(billedContainerTypes).toEqual([created?.id]);
        } else if (billing === 'directToCustomer') {
            expect(information.some(({ actions }) => actions.includes('Set up billing'))).toBe(true);
        }
        expect(errors).toEqual([]);
    });
}

async function selectCrossTenantApp() {
    const app = await GetOrCreateApp.run(true);
    if (!app) { throw new Error('Offline enterprise application was not selectable'); }
    return app;
}

function registrationWrites() {
    return fake.calls.filter(call => call.method === 'PUT' && call.path === registrationPath);
}

function registerFromTree(containerType: ContainerType | undefined) {
    if (!containerType) { throw new Error('Expected the original container type to exist'); }
    const treeItem = new ContainerTypeTreeItem(containerType);
    const menu = contributes.menus['view/item/context'].find(item =>
        item.command === `spe.${RegisterOnLocalTenant.COMMAND}` && item.when?.includes('containerTypeTreeItem'));
    const pattern = menu?.when?.match(/^viewItem =~ \/(.+)\/$/)?.[1];
    if (!pattern) { throw new Error('Expected the registration command in the container type context menu'); }
    expect(treeItem.contextValue).toMatch(new RegExp(pattern));
    return RegisterOnLocalTenant.run(treeItem);
}

test('registers the returned container type and announces success only after Graph confirms it', async () => {
    setGraphResponses();
    selectedAction = 'Register in this tenant';
    const app = await selectCrossTenantApp();
    const fallback = fake.responder;
    let signalStarted!: () => void;
    let finishWrite!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const pending = new Promise<void>(resolve => { finishWrite = resolve; });
    fake.responder = call => {
        if (call.path === registrationPath && call.method === 'PUT') {
            signalStarted();
            return pending.then(() => fallback(call));
        }
        return fallback(call);
    };

    const creating = runTrialFlow({ displayName, app });
    await Promise.race([started, creating.then(() => { throw new Error('Expected registration to start'); })]);
    try {
        expect(information.map(({ message }) => message)).not.toContain(registrationSuccessMessage);
        expect(handoffs).toEqual([]);
    } finally {
        finishWrite();
    }
    const created = await creating;
    expect(information.map(({ message }) => message)).toContain(registrationSuccessMessage);
    expect(handoffs).toEqual([registrationResponse]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(openedUrls).toEqual([]);
    expect(fake.calls.filter(call => call.method !== 'GET')).toMatchObject([
        { method: 'POST', path: '/storage/fileStorage/containerTypes', body: { owningAppId: appId } },
        {
            method: 'PUT', path: `/storage/fileStorage/containerTypeRegistrations/${created?.id}`, version: 'v1.0',
            body: { applicationPermissionGrants: [{ appId: created?.owningAppId, delegatedPermissions: ['full'], applicationPermissions: ['full'] }] }
        }
    ]);
    expect(fake.last).toMatchObject({ method: 'GET', path: registrationPath });
});

test('offers the guide when Graph denies registration for missing consent', async () => {
    setGraphResponses();
    selectedAction = 'Register in this tenant';
    selectedErrorAction = 'Open registration guide';
    const fallback = fake.responder;
    fake.responder = call => {
        if (call.path === registrationPath && call.method === 'PUT') {
            throw Object.assign(new Error('Admin consent is required'), { code: 'Forbidden', statusCode: 403 });
        }
        return fallback(call);
    };

    await expect(runTrialFlow({ displayName })).resolves.toMatchObject({ id: registrationResponse.id });

    expect(registrationWrites()).toHaveLength(1);
    expect(errors).toEqual([{
        message: expect.stringMatching(/Registration failed.*required consent.*Admin consent is required/),
        actions: ['Open registration guide']
    }]);
    expect(openedUrls).toEqual([registrationGuide]);
    expect(information.map(({ message }) => message)).not.toContain(registrationSuccessMessage);
    expect(handoffs).toEqual([]);
});

test('guides the user to add the owning enterprise application when it is missing', async () => {
    setGraphResponses();
    selectedAction = 'Register in this tenant';
    const fallback = fake.responder;
    fake.responder = call => {
        if (call.method === 'GET' && call.path === enterpriseApplicationPath) {
            throw Object.assign(new Error('Service principal not found'), { statusCode: 404 });
        }
        return fallback(call);
    };

    await expect(runTrialFlow({ displayName })).resolves.toMatchObject({ id: registrationResponse.id });

    expect(registrationWrites()).toEqual([]);
    expect(errors).toEqual([{
        message: expect.stringContaining('No eligible owning enterprise application was found in this tenant'),
        actions: ['Open registration guide']
    }]);
    expect(information.map(({ message }) => message)).not.toContain(registrationSuccessMessage);
});

test('after Skip, the context menu registers the same container type without recreating it', async () => {
    setGraphResponses();
    selectedAction = 'Skip';
    const created = await runTrialFlow({ displayName });
    expect(registrationWrites()).toEqual([]);
    expect(handoffs).toEqual([]);

    await expect(registerFromTree(created)).resolves.toMatchObject({ id: created?.id, owningAppId: appId });

    expect(registrationWrites()).toHaveLength(1);
    expect(fake.calls.filter(call => call.method === 'POST')).toHaveLength(1);
    expect(information.map(({ message }) => message)).toContain(registrationSuccessMessage);
    expect(errors).toEqual([]);
});

test('reports an existing registration without touching its grants', async () => {
    setGraphResponses();
    const created = await runTrialFlow({ displayName });
    registration = registrationResponse;
    const before = fake.calls.length;

    await expect(registerFromTree(created)).resolves.toBeUndefined();

    expect(information[information.length - 1]).toEqual({ message: expect.stringContaining('Already registered'), actions: [] });
    expect(fake.calls.slice(before)).toMatchObject([{ method: 'GET', path: registrationPath }]);
    expect(handoffs).toEqual([]);
    expect(errors).toEqual([]);
});

test('identifies a failed registration and retries it from the context menu without recreating', async () => {
    setGraphResponses();
    selectedAction = 'Register in this tenant';
    const fallback = fake.responder;
    fake.responder = call => {
        if (call.path === registrationPath && call.method === 'PUT') {
            throw Object.assign(new Error('Service temporarily unavailable'), { statusCode: 503 });
        }
        return fallback(call);
    };

    const created = await runTrialFlow({ displayName });
    expect(errors).toEqual([{
        message: expect.stringMatching(/Registration failed.*Service temporarily unavailable.*retry/i), actions: []
    }]);
    expect(information.map(({ message }) => message)).not.toContain(registrationSuccessMessage);
    expect(handoffs).toEqual([]);
    fake.responder = fallback;

    await expect(registerFromTree(created)).resolves.toMatchObject({ id: created?.id, owningAppId: appId });
    expect(registrationWrites()).toHaveLength(2);
    expect(registrationWrites()[1].body).toEqual(registrationWrites()[0].body);
    expect(fake.calls.filter(call => call.method === 'POST')).toHaveLength(1);
    expect(information.map(({ message }) => message)).toContain(registrationSuccessMessage);
});

test('stops rather than guessing registration status when the lookup fails', async () => {
    setGraphResponses();
    selectedAction = 'Register in this tenant';
    const fallback = fake.responder;
    fake.responder = call => {
        if (call.path === registrationPath && call.method === 'GET') {
            throw Object.assign(new Error('Cannot read existing registration'), { statusCode: 503 });
        }
        return fallback(call);
    };

    await runTrialFlow({ displayName });

    expect(registrationWrites()).toEqual([]);
    expect(errors[0]?.message).toContain('Cannot read existing registration');
    expect(handoffs).toEqual([]);
});

test('does not register in another tenant if the signed-in tenant changes after creation', async () => {
    setGraphResponses();
    selectedAction = 'Register in this tenant';
    const fallback = fake.responder;
    fake.responder = call => {
        const response = fallback(call);
        if (call.method === 'POST') { signedInTenant = homeTenant; }
        return response;
    };

    await runTrialFlow({ displayName });

    expect(information[0]?.message).toContain(currentTenant);
    expect(errors[0]?.message).toContain(`Sign in to tenant ${currentTenant}`);
    expect(registrationWrites()).toEqual([]);
});

test('a local owner still offers and invokes the registration command', async () => {
    setGraphResponses();
    const fallback = fake.responder;
    const localApp = { appId: '11111111-0000-4000-8000-000000000001', displayName: 'Local owner' };
    fake.responder = call => call.method === 'GET' && call.path === registrationPath
        ? {
            id: 'new-container-type', name: displayName, owningAppId: localApp.appId,
            billingClassification: 'trial', billingStatus: 'valid', settings: {}
        }
        : fallback(call);
    selectedAction = 'Register on local tenant';

    const created = await runTrialFlow({ displayName, app: localApp });

    expect(created?.owningAppId).toBe(localApp.appId);
    expect(information[0]?.actions).toEqual(['Register on local tenant', 'Skip']);
    expect(information[1]?.message).toContain('Already registered');
    expect(registrationWrites()).toEqual([]);
    expect(openedUrls).toEqual([]);
    expect(errors).toEqual([]);
});

test('does not offer registration while cross-tenant creation is pending or after it fails', async () => {
    setGraphResponses();
    const app = await selectCrossTenantApp();
    const fallback = fake.responder;
    let signalStarted!: () => void;
    let rejectCreate!: (error: Error) => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const pending = new Promise<never>((_resolve, reject) => { rejectCreate = reject; });
    fake.responder = call => {
        if (call.method === 'POST' && call.path === '/storage/fileStorage/containerTypes') {
            signalStarted();
            return pending;
        }
        return fallback(call);
    };
    const creating = runTrialFlow({ displayName, app });

    await Promise.race([started, creating.then(() => { throw new Error('Expected the creation request to start'); })]);
    try {
        expect(information).toEqual([]);
    } finally {
        rejectCreate(new Error('Creation rejected'));
    }
    await expect(creating).resolves.toBeUndefined();
    expect(information).toEqual([]);
    expect(errors[0]?.message).toMatch(/Failed to create container type.*Creation rejected/);
    expect(registrationWrites()).toEqual([]);
});

test('does not create a container type when cross-tenant directory discovery fails', async () => {
    setGraphResponses(new Error('Directory read permission required'));

    await expect(runTrialFlow({ displayName })).resolves.toBeUndefined();
    expect(offeredApps).toEqual([]);
    expect(errors).toEqual([{ message: 'Could not load apps from other tenants: Directory read permission required', actions: [] }]);
    expect(fake.calls.every(call => call.method === 'GET')).toBe(true);
});
