
import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { ContainerTypeTreeItem } from '../views/treeview/development/ContainerTypeTreeItem';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the delete container type command
export class DeleteContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'deleteContainerType';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const message = "Are you sure you delete this Container Type?";
        const userChoice = await vscode.window.showInformationMessage(
            message,
            'OK', 'Cancel'
        );

        if (userChoice === 'Cancel') {
            return;
        }

        vscode.window.showInformationMessage(`Container Type deletion starting...`);

        const account = Account.get()!;
        const containerType = containerTypeViewModel.containerType;

        try {
            const containerTypeDetails = await account.getContainerTypeDetailsById(containerType.owningApp!.clientId, containerType.containerTypeId);
            const result = await account.deleteContainerTypeById(containerType.owningApp!.clientId, containerType.containerTypeId);
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully deleted`);
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to delete Container Type ${containerType.displayName} : ${error.message}`);
            return;
        }
    }
}
