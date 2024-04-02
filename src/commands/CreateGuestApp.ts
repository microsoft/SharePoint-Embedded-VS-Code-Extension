/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { GuestApplicationsTreeItem } from '../views/treeview/development/GuestApplicationsTreeItem';
import { ContainerType } from '../models/ContainerType';
import { AddGuestAppFlow, AddGuestAppFlowState } from '../views/qp/UxFlows';
import { App } from '../models/App';
import { ProgressNotification } from '../views/notifications/ProgressNotification';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';
import TelemetryProvider from '../services/TelemetryProvider';

// Static class that handles the create guest app command
export class CreateGuestApp extends Command {
    // Command name
    public static readonly COMMAND = 'createGuestApp';

    // Command handler
    public static async run(guestApplicationsModel?: GuestApplicationsTreeItem): Promise<void> {
        if (!guestApplicationsModel) {
            return;
        }
        const containerType: ContainerType = guestApplicationsModel.containerType;

        let account = Account.get()!;
        let addGuestAppState: AddGuestAppFlowState | undefined;
        try {
            addGuestAppState = await new AddGuestAppFlow(containerType).run();
            if (addGuestAppState === undefined) {
                return;
            }
        } catch (error) {
            return;
        }

        // Create or import Azure app
        let app: App | undefined;
        try {
            if (addGuestAppState.reconfigureApp) {
                vscode.window.showInformationMessage(`Azure AD Application configuring starting...`);
                app = await account.importApp(addGuestAppState.appId!, true);
                if (!app) {
                    throw new Error("App is undefined");
                }
                // 20-second progress to allow app propagation before consent flow
                await new ProgressNotification().show();
                await app.consent();
            } else if (addGuestAppState.shouldCreateNewApp()) {
                vscode.window.showInformationMessage(`Azure AD Application configuring starting...`);
                app = await account.createApp(addGuestAppState.appName!, true);
                if (!app) {
                    throw new Error("App is undefined");
                }
                // 20-second progress to allow app propagation before consent flow
                await new ProgressNotification().show();
                await app.consent();
            } else {
                // Only other case is the app is already known -- try to get it from Account (should already be consented)
                app = account.apps.find(app => app.clientId === addGuestAppState!.appId!);
            }

            if (!app) {
                throw new Error("");
            }

        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create or import Azure AD application: " + error.message);
            TelemetryProvider.get().sendTelemetryErrorEvent('guestapp create', { description: 'Unable to create or import Azure AD application', error: error.message });
            return;
        }

        // Register Container Type
        try {
            await containerType.addTenantRegistration(account.tenantId, app, addGuestAppState.delegatedPerms, addGuestAppState.applicationPerms);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
            TelemetryProvider.get().sendTelemetryErrorEvent('guestapp create', { description: 'Unable to register Free Trial Container Type', error: error.message });
            return;
        }

        vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully registered on Azure AD App: ${app.displayName}`);
        DevelopmentTreeViewProvider.getInstance().refresh();
        guestApplicationsModel.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
}
