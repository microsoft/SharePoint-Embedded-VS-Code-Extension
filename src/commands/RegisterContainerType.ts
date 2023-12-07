
import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';
import { ContainerType } from '../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the register container type command
export class RegisterContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'registerContainerType';

    // Command handler
    public static async run(containerType?: ContainerType): Promise<void> {
        const account = Account.get()!;
        
        if (!containerType && account.containerTypes && account.containerTypes.length > 0) {
            containerType = account.containerTypes[0];
        }

        if (!containerType) {
            vscode.window.showErrorMessage(`Container Type registration failed. No container types found.`);
            return;
        }

        try {
            await containerType.addTenantRegistration(account.tenantId, containerType.owningApp!, ["full"], ["full"]);
            vscode.window.showInformationMessage(`Container Type ${containerType.displayName} successfully registered on tenant ${account.tenantId}`);
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to register Container Type ${containerType.displayName}: ${error}`);
            return;
        }
    }
}
