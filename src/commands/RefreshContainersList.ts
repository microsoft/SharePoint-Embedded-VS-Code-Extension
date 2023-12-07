
import { Command } from './Command';
import * as vscode from 'vscode';
import { ContainerType } from '../models/ContainerType';
import { ContainersTreeItem } from '../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the refresh container list command
export class RefreshContainersList extends Command {
    // Command name
    public static readonly COMMAND = 'refreshContainerList';

    // Command handler
    public static async run(containersViewModel?: ContainersTreeItem): Promise<void> {
        if (!containersViewModel) {
            return;
        }
        const containerType: ContainerType = containersViewModel.containerType;
        try {
            await containerType.getContainers();
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to refresh containers list " + error.message);
            return;
        }
    }
}
