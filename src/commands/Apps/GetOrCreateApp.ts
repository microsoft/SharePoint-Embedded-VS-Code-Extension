/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { App, AppType } from '../../models/App';
import { GetAccount } from '../Accounts/GetAccount';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';

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
        qp.title = (appType === undefined || appType === AppType.OwningApp) ? 'Select or create an Owning Application for your Container Type' : 'Select or Create a Guest Application for your Container Type';
        qp.placeholder = 'Enter a new app name or search for an existing app by name or Id';

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
        const newAppItem: AppQuickPickItem = {
            id: 'new',
            label: `Create Azure app: ${defaultAppName}`,
            detail: 'Creates a new Azure Entra app registration',
            alwaysShow: true,
            iconPath: new vscode.ThemeIcon('new-app-icon')
        };
        const azureAppsSeparator: AppQuickPickItem = {
            kind: vscode.QuickPickItemKind.Separator,
            label: 'Your Azure Apps',
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
        };

        let timeout: NodeJS.Timeout | undefined;
        qp.onDidChangeValue(value => {
            newAppItem.name = value || defaultAppName;
            newAppItem.label = `New Azure AD Application: ${newAppItem.name}`;

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
                const appProgressWindow = new ProgressWaitNotification('Configuring Entra app...');
                appProgressWindow.show();
                if (appId === newAppItem.id && appName) {
                    const app = await account.appProvider.create(appName);
                    // wait for app creation to propogate before updating identifier URI
                    setTimeout(() => {}, 5000);
                    await account.appProvider.addIdentifierUri(app);
                    if (!app) {
                        vscode.window.showErrorMessage('Failed to create a new app');
                        appProgressWindow.hide();
                        return resolve(undefined);
                    }
                    appProgressWindow.hide();
                    return resolve(app);
                } else if (appId) {
                    const app = await account.appProvider.get(appId);
                    if (!app) {
                        appProgressWindow.hide();
                        vscode.window.showErrorMessage('Failed to get the selected app');
                        return resolve(undefined);
                    }
                    await account.appProvider.update(appId);
                    await account.appProvider.addResourceAccess(app, {
                        resourceAppId: account.appProvider.GraphResourceAppId,
                        resourceAccess: [
                            account.appProvider.FileStorageContainerRole,
                            account.appProvider.FileStorageContainerScope
                        ]
                    });
                    await account.appProvider.addResourceAccess(app, {
                        resourceAppId: account.appProvider.SharePointResourceAppId,
                        resourceAccess: [
                            account.appProvider.ContainerSelectedRole,
                            account.appProvider.ContainerSelectedScope
                        ]
                    });
                    appProgressWindow.hide();
                    return resolve(app);
                }
                appProgressWindow.hide();
                return resolve(undefined);
            });
            qp.show();
            refreshQuickPickItems();
        });   
    };
}

