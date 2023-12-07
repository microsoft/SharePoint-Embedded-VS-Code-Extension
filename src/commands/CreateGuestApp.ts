
import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { GuestApplicationsTreeItem } from '../views/treeview/development/GuestApplicationsTreeItem';
import { ContainerType } from '../models/ContainerType';
import { AddGuestAppFlow, AddGuestAppFlowState } from '../views/qp/UxFlows';
import { App } from '../models/App';
import { ProgressNotification } from '../views/notifications/ProgressNotification';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

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
                app = await account.importApp(addGuestAppState.appId!, true);
                // 20-second progress to allow app propagation before consent flow
                await new ProgressNotification().show();
            } else if (addGuestAppState.shouldCreateNewApp()) {
                app = await account.createApp(addGuestAppState.appName!, true);
                // 20-second progress to allow app propagation before consent flow
                await new ProgressNotification().show();
            } else {
                // Only other case is the app is already known -- try to get it from Account (should already be consented)
                app = account.apps.find(app => app.clientId === addGuestAppState!.appId!);
            }

            if (!app) {
                throw new Error("");
            }

        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to create or import Azure AD application: " + error.message);
            return;
        }

        // Register Container Type
        try {
            await containerType.addTenantRegistration(account.tenantId, app, addGuestAppState.delegatedPerms, addGuestAppState.applicationPerms);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type: " + error.message);
            return;
        }
        DevelopmentTreeViewProvider.getInstance().refresh();
        guestApplicationsModel.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
}
