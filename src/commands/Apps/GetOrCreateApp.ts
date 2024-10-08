/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { App, AppType } from '../../models/App';
import { GetAccount } from '../Accounts/GetAccount';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the create trial container type command
export class GetOrCreateApp extends Command {
    // Command name
    public static readonly COMMAND = 'Apps.getOrCreate';

    // Command handler
    public static async run(appType?: AppType): Promise<App | undefined> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        const qp = vscode.window.createQuickPick<AppQuickPickItem>();
        qp.title = (appType === undefined || appType === AppType.OwningApp) ? vscode.l10n.t('Select or create an Owning Application for your Container Type') : vscode.l10n.t('Select or Create a Guest Application for your Container Type');
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
            if (!excludedAppIds) {
                const containerTypeProvider = account.containerTypeProvider;
                const containerTypes = await containerTypeProvider.list();
                excludedAppIds = containerTypes.map(ct => ct.owningAppId);
            }

            const exclusions = excludedAppIds || [];
            const apps = await account.appProvider.search(query);
            const filteredApps = apps.filter(app => !exclusions.includes(app.appId!));
            const appItems = filteredApps.map(app => (
                {
                    id: app.appId!,
                    label: app.displayName,
                    detail: app.appId,
                    name: app.displayName,
                    iconPath: new vscode.ThemeIcon('app-icon'),
                } as AppQuickPickItem
            ));
            qp.items = [newAppItem, azureAppsSeparator, ...appItems];
            qp.busy = false;
            
            if (!validateAppName(query)) {
                qp.title = vscode.l10n.t('Invalid app name. App name must be less than 120 characters and not contain the characters < > ; & %');
                qp.items = [];
                return;
            } else {
                qp.title = (appType === undefined || appType === AppType.OwningApp) ? vscode.l10n.t('Select or create an Owning Application for your Container Type') : vscode.l10n.t('Select or Create a Guest Application for your Container Type');
            }
        };

        let timeout: NodeJS.Timeout | undefined;
        qp.onDidChangeValue(value => {
            if (validateAppName(value)) {
                newAppItem.name = value || defaultAppName;
                const label = vscode.l10n.t('New Azure AD Application: {0}', newAppItem.name);
                newAppItem.label = label;
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

        return new Promise<App | undefined>((resolve) => {
            qp.onDidHide(async () => {
                qp.dispose();
                if (appId === newAppItem.id && appName) {
                    const createAppProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating Entra app...'));
                    createAppProgressWindow.show();
                    const creationTimer = new Timer(60 * 1000);
                    const app = await account.appProvider.create(appName);
                    let propogatedApp = await account.appProvider.get(app.clientId);
                    while (!propogatedApp && !creationTimer.finished) {
                        await new Promise(r => setTimeout(r, 3000));
                        propogatedApp = await account.appProvider.get(app.clientId);
                    }
                    if (!app) {
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to create a new app'));
                        createAppProgressWindow.hide();
                        return resolve(undefined);
                    }
                    await account.appProvider.addIdentifierUri(app);
                    createAppProgressWindow.hide();
                    return resolve(app);
                } else if (appId) {
                    const configureAppProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Configuring Entra app...'));
                    configureAppProgressWindow.show();
                    const app = await account.appProvider.get(appId);
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