
import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the sign out command
export class SignOut extends Command {
    // Command name
    public static readonly COMMAND = 'signOut';

    // Command handler
    public static async run(): Promise<void> {
        try {
            const message = "Are you sure you want to log out? All your SharePoint Embedded data will be forgotten.";
            const userChoice = await vscode.window.showInformationMessage(
                message,
                'OK', 'Cancel'
            );

            if (userChoice === 'Cancel') {
                return;
            }

            await Account.get()!.logout();
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    }
}
