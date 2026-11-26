/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { Application } from '../../models/schemas';
import { AuthenticationState } from '../../services/AuthenticationState';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { GraphProvider } from '../../services/Graph/GraphProvider';

export type SelectedEntraApp = Application & { isCrossTenant?: true };

// Static class that handles the get or create application command
export class GetOrCreateApp extends Command {
    // Command name
    public static readonly COMMAND = 'Apps.getOrCreate';

    // Command handler
    public static async run(isOwningApp: boolean = true): Promise<SelectedEntraApp | undefined> {
        // Get authentication state
        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in first'));
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        const qp = vscode.window.createQuickPick<AppQuickPickItem>();
        qp.title = isOwningApp ? vscode.l10n.t('Select or create an Owning Application for your Container Type') : vscode.l10n.t('Select or create an App Registration for your Container Type');
        qp.placeholder = vscode.l10n.t('Enter a new app name or search for an existing app by name or Id');

        // Disable default filtering and sorting behavior on the quick pick
        // https://github.com/microsoft/vscode/issues/73904#issuecomment-680298036
        (qp as any).sortByLabel = false;
        qp.matchOnDetail = false;
        qp.matchOnDescription = false;

        interface AppQuickPickItem extends vscode.QuickPickItem {
            id: string;
            name?: string;
        }
        const defaultAppName = 'SharePoint Embedded App';
        const label = vscode.l10n.t('Create Azure app: {0}', defaultAppName);
        const newAppItem: AppQuickPickItem = {
            id: 'new',
            label: label,
            detail: vscode.l10n.t('Creates a new Azure Entra app registration'),
            alwaysShow: true,
            iconPath: new vscode.ThemeIcon('new-app-icon')
        };
        // GUID regex for detecting client IDs typed into the search box
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // External app item — only shown in guest app mode when input matches a GUID
        const externalAppItem: AppQuickPickItem = {
            id: 'external',
            label: '',
            detail: vscode.l10n.t('Add an app by its Client ID (for apps outside your tenant)'),
            alwaysShow: false,
            iconPath: new vscode.ThemeIcon('link-external')
        };

        const azureAppsSeparator: AppQuickPickItem = {
            kind: vscode.QuickPickItemKind.Separator,
            label: vscode.l10n.t('Your Azure Apps'),
            id: 'all'
        };

        const crossTenantAppItem: AppQuickPickItem = {
            id: 'crossTenant',
            label: vscode.l10n.t('Select an app from another tenant...'),
            detail: vscode.l10n.t('Select a multitenant Entra app already registered in this tenant'),
            alwaysShow: true,
            iconPath: new vscode.ThemeIcon('link-external')
        };
        const initialItems = isOwningApp ? [newAppItem, crossTenantAppItem] : [newAppItem];
        qp.items = initialItems;

        let excludedAppIds: Promise<Set<string>> | undefined;
        const getExcludedAppIds = () => excludedAppIds ??= graphProvider.containerTypes.list()
            .then(containerTypes => new Set(containerTypes.map(ct => ct.owningAppId.toLowerCase())))
            .catch(error => {
                excludedAppIds = undefined;
                throw error;
            });

        let refreshId = 0;
        const refreshQuickPickItems = async (query?: string) => {
            const id = ++refreshId;
            qp.busy = true;
            try {
                const exclusions = isOwningApp ? await getExcludedAppIds() : undefined;
                const term = query?.trim();
                const { applications } = term
                    ? await graphProvider.applications.search(term)
                    : await graphProvider.applications.list();
                if (id !== refreshId) {
                    return;
                }

                const appItems: AppQuickPickItem[] = [];
                for (const app of applications) {
                    if (app.appId && !exclusions?.has(app.appId.toLowerCase())) {
                        appItems.push({
                            id: app.appId,
                            label: app.displayName,
                            detail: app.appId,
                            name: app.displayName,
                            iconPath: new vscode.ThemeIcon('app-icon')
                        });
                    }
                }

                if (!validateAppName(query)) {
                    qp.title = vscode.l10n.t('Invalid app name. App name must be less than 120 characters and not contain the characters < > ; & %');
                    qp.items = [];
                    return;
                }
                qp.title = isOwningApp ? vscode.l10n.t('Select or create an Owning Application for your Container Type') : vscode.l10n.t('Select or create an App Registration for your Container Type');
                qp.items = [...(externalAppVisible ? [externalAppItem] : []), ...initialItems, azureAppsSeparator, ...appItems];
            } catch (error) {
                if (id === refreshId) {
                    void vscode.window.showErrorMessage(vscode.l10n.t('Could not load existing Entra apps: {0}', errorMessage(error)));
                }
            } finally {
                if (id === refreshId) {
                    qp.busy = false;
                }
            }
        };

        // Track whether the external app item is currently visible
        let externalAppVisible = false;

        let timeout: NodeJS.Timeout | undefined;
        qp.onDidChangeValue(value => {
            if (validateAppName(value)) {
                newAppItem.name = value || defaultAppName;
                const label = vscode.l10n.t('New Azure AD Application: {0}', newAppItem.name);
                newAppItem.label = label;
            }

            // Show/hide external app item when input matches a GUID (guest app mode only)
            if (!isOwningApp && guidRegex.test(value.trim())) {
                externalAppItem.label = vscode.l10n.t('Add by Client ID: {0}', value.trim());
                externalAppItem.name = value.trim();
                if (!externalAppVisible) {
                    externalAppVisible = true;
                    // Prepend external item to current items
                    qp.items = [externalAppItem, ...qp.items.filter(item => item.id !== 'external')];
                }
            } else if (externalAppVisible) {
                externalAppVisible = false;
                qp.items = qp.items.filter(item => item.id !== 'external');
            }

            if (timeout) {
                clearTimeout(timeout);
            }
            ++refreshId;
            timeout = setTimeout(() => void refreshQuickPickItems(value), 200);
        });

        let appId: string | undefined;
        let appName: string | undefined;
        qp.onDidChangeSelection(selectedItems => {
            if (selectedItems.length === 0) {
                return;
            }
            const selectedItem = selectedItems[0];
            appId = selectedItem.id;
            appName = selectedItem.name || defaultAppName;
            qp.hide();
        });

        return new Promise<SelectedEntraApp | undefined>((resolve) => {
            qp.onDidHide(async () => {
                clearTimeout(timeout);
                ++refreshId;
                qp.dispose();
                if (isOwningApp && appId === crossTenantAppItem.id) {
                    return resolve(await pickCrossTenantApp(graphProvider, account.tenantId, getExcludedAppIds));
                }
                if (appId === newAppItem.id && appName) {
                    const createAppProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating Entra app...'));
                    createAppProgressWindow.show();
                    const creationTimer = new Timer(60 * 1000);

                    let app: Application;
                    let propagatedApp: Application | null;
                    try {
                        // Create the application using the new service
                        app = await graphProvider.applications.create({
                            displayName: appName
                        });

                        // Wait for propagation
                        propagatedApp = await graphProvider.applications.get(app.appId!, { useAppId: true });
                        while (!propagatedApp && !creationTimer.finished) {
                            await new Promise(r => setTimeout(r, 3000));
                            propagatedApp = await graphProvider.applications.get(app.appId!, { useAppId: true });
                        }
                    } catch (error: any) {
                        console.error('[GetOrCreateApp] Failed to create Entra app:', error);
                        createAppProgressWindow.hide();
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to create Entra app: {0}', error?.message || error));
                        return resolve(undefined);
                    }

                    if (!propagatedApp) {
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to create or propagate the new app'));
                        createAppProgressWindow.hide();
                        return resolve(undefined);
                    }

                    // Add identifier URI
                    try {
                        await addIdentifierUriToApp(graphProvider, app);
                    } catch (error: any) {
                        console.warn('Failed to add identifier URI:', error);
                        vscode.window.showWarningMessage(vscode.l10n.t('Failed to add identifier URI to app: {0}. You may need to configure it manually in Azure Portal.', error.message || error));
                    }

                    // Configure owning app: API scope + required permissions
                    if (isOwningApp) {
                        try {
                            await graphProvider.applications.ensureContainerManageScope(app.appId!, { useAppId: true });
                        } catch (error: any) {
                            console.warn('[GetOrCreateApp] Failed to add Container.Manage scope:', error);
                            vscode.window.showWarningMessage(vscode.l10n.t('Failed to add Container.Manage scope to app: {0}. You may need to configure it manually in Azure Portal.', error.message || error));
                        }
                        try {
                            await graphProvider.applications.ensureOwningAppPermissions(app.appId!, { useAppId: true });
                        } catch (error: any) {
                            console.warn('[GetOrCreateApp] Failed to add owning app permissions:', error);
                            vscode.window.showWarningMessage(vscode.l10n.t('Failed to add required permissions to app: {0}. You may need to configure them manually in Azure Portal.', error.message || error));
                        }
                    }

                    createAppProgressWindow.hide();
                    return resolve(app);
                } else if (appId === 'external' && appName) {
                    // External app by Client ID — the GUID is stored in appName
                    const externalClientId = appName;
                    const lookupProgress = new ProgressWaitNotification(vscode.l10n.t('Looking up app...'));
                    lookupProgress.show();
                    try {
                        // Try to resolve display name via service principal lookup
                        const sp = await graphProvider.applications.getServicePrincipal(externalClientId);
                        lookupProgress.hide();
                        return resolve({
                            id: sp.id!,
                            appId: externalClientId,
                            displayName: sp.displayName ?? externalClientId
                        } as Application);
                    } catch {
                        // Service principal not found in tenant — use the GUID as a fallback.
                        // The permissions API only needs appId, display name is cosmetic.
                        lookupProgress.hide();
                        console.log(`[GetOrCreateApp] Service principal not found for ${externalClientId}, using client ID as display name`);
                        return resolve({
                            id: externalClientId,
                            appId: externalClientId,
                            displayName: externalClientId
                        } as Application);
                    }
                } else if (appId) {
                    const configureAppProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Configuring Entra app...'));
                    configureAppProgressWindow.show();
                    const app = (await graphProvider.applications.get(appId, { useAppId: true })) ?? undefined;
                    if (!app) {
                        configureAppProgressWindow.hide();
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to get the selected app'));
                        return resolve(undefined);
                    }
                    configureAppProgressWindow.hide();
                    return resolve(app);
                }
                return resolve(undefined);
            });
            qp.show();
            refreshQuickPickItems();
        });
    };
}

async function pickCrossTenantApp(
    graphProvider: GraphProvider,
    tenantId: string,
    getExcludedAppIds: () => Promise<ReadonlySet<string>>
): Promise<SelectedEntraApp | undefined> {
    const progress = new ProgressWaitNotification(vscode.l10n.t('Loading apps from other tenants...'));
    void progress.show();
    let items: (vscode.QuickPickItem & { app: Application })[];
    try {
        const [apps, exclusions] = await Promise.all([
            graphProvider.applications.listCrossTenantApplications(tenantId),
            getExcludedAppIds()
        ]);
        items = apps
            .filter(app => !exclusions.has(app.appId.toLowerCase()))
            .map(app => ({ label: app.displayName, detail: app.appId, app }));
    } catch (error) {
        void vscode.window.showErrorMessage(vscode.l10n.t('Could not load apps from other tenants: {0}', errorMessage(error)));
        return;
    } finally {
        progress.hide();
    }

    if (!items.length) {
        void vscode.window.showInformationMessage(vscode.l10n.t('No available apps from other tenants were found. The app must be multitenant and registered as an enterprise application in this tenant.'));
        return;
    }

    const selected = await vscode.window.showQuickPick(items, {
        title: vscode.l10n.t('Select an owning app from another tenant'),
        placeHolder: vscode.l10n.t('Search by app name or application ID'),
        matchOnDetail: true,
        ignoreFocusOut: true
    });
    return selected && { ...selected.app, isCrossTenant: true };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function validateAppName(name: string | undefined): boolean {
    const validNamePattern = /^[^<>;&%]{0,120}$/;
    const isValidName = validNamePattern.test(name || '');
    return isValidName;
}

/**
 * Add identifier URI to an application
 */
async function addIdentifierUriToApp(graphProvider: GraphProvider, app: Application): Promise<void> {
    if (!app.appId) {
        throw new Error('Application does not have an appId');
    }
    
    const identifierUri = `api://${app.appId}`;
    
    // Update the application with the identifier URI
    await graphProvider.applications.update(app.id!, {
        identifierUris: [identifierUri]
    });
}