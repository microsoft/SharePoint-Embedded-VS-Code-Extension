import * as vscode from 'vscode';
import { ApplicationTreeItem } from "../views/treeview/development/ApplicationTreeItem";
import { Command } from "./Command";
import { Account } from '../models/Account';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the rename application command
export class RenameApplication extends Command {
    // Command name
    public static readonly COMMAND = 'renameApplication';

    // Command handler
    public static async run(applicationTreeItem?: ApplicationTreeItem): Promise<void> {
        if (!applicationTreeItem) {
            return;
        }

        const applicationDisplayName = await vscode.window.showInputBox({
            prompt: 'New display name:'
        });

        if (!applicationDisplayName) {
            vscode.window.showErrorMessage('No application display name provided');
            return;
        }

        const account = Account.get()!;
        const app = applicationTreeItem.app;
        await account.renameApp(app, applicationDisplayName);
        await account.loadFromStorage();
        DevelopmentTreeViewProvider.getInstance().refresh();
    }
}