/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { Application } from '../../models/schemas';
import { GraphAuthProvider } from '../../services/Auth';
import { AuthenticationState } from '../../services/AuthenticationState';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { GraphProvider } from '../../services/Graph/GraphProvider';

// Static class that handles the get or create application command
export class GetOrCreateApp extends Command {
    // Command name
    public static readonly COMMAND = 'Apps.getOrCreate';

    // Command handler
    public static async run(isOwningApp: boolean = true): Promise<Application | undefined> {
        // Get authentication state
        const authState = AuthenticationState.getInstance();
        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in first'));
            return;
        }

        // Get Graph provider
        const graphAuth = GraphAuthProvider.getInstance();
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

        let excludedAppIds: string[] | undefined;
        const refreshQuickPickItems = async (query?: string) => {
            if (qp.items.length === 0) {
                qp.items = [newAppItem];
            }

            qp.busy = true;
            if (isOwningApp && !excludedAppIds) {
                // Get container types to find apps that are already used
                const containerTypes = await graphProvider.containerTypes.list();
                excludedAppIds = containerTypes.map((ct) => ct.owningAppId);
            }

            const exclusions = isOwningApp ? (excludedAppIds || []) : [];
            // Search applications using the new service
        let appsResult: { applications: Application[] };
        
        if (query && query.trim()) {
            // Search by display name if query is provided
            appsResult = await graphProvider.applications.search(query.trim());
        } else {
            // List all applications if no query
            appsResult = await graphProvider.applications.list();
        }
            const filteredApps = appsResult.applications.filter((app) => !exclusions.includes(app.appId!));
            const appItems = filteredApps.map((app) => (
                {
                    id: app.appId!,
                    label: app.displayName,
                    detail: app.appId,
                    name: app.displayName,
                    iconPath: new vscode.ThemeIcon('app-icon'),
                } as AppQuickPickItem
            ));
            const baseItems = externalAppVisible
                ? [externalAppItem, newAppItem, azureAppsSeparator, ...appItems]
                : [newAppItem, azureAppsSeparator, ...appItems];
            qp.items = baseItems;
            qp.busy = false;
            
            if (!validateAppName(query)) {
                qp.title = vscode.l10n.t('Invalid app name. App name must be less than 120 characters and not contain the characters < > ; & %');
                qp.items = [];
                return;
            } else {
                qp.title = isOwningApp ? vscode.l10n.t('Select or create an Owning Application for your Container Type') : vscode.l10n.t('Select or create an App Registration for your Container Type');
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
            timeout = setTimeout(async () => {
                refreshQuickPickItems(value);
            }, 200);
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

        return new Promise<Application | undefined>((resolve) => {
            qp.onDidHide(async () => {
                qp.dispose();
                if (appId === newAppItem.id && appName) {
                    const createAppProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating Entra app...'));
                    createAppProgressWindow.show();
                    const creationTimer = new Timer(60 * 1000);
                    
                    // Create the application using the new service
                    const app = await graphProvider.applications.create({
                        displayName: appName
                    });
                    
                    // Wait for propagation
                    let propagatedApp = await graphProvider.applications.get(app.appId!, { useAppId: true });
                    while (!propagatedApp && !creationTimer.finished) {
                        await new Promise(r => setTimeout(r, 3000));
                        propagatedApp = await graphProvider.applications.get(app.appId!, { useAppId: true });
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