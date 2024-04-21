/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from './Command';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';

// Static class that handles the sign in command
export class Refresh extends Command {
    // Command name
    public static readonly COMMAND = 'refresh';

    // Command handler
    public static async run(treeItem?: vscode.TreeItem): Promise<void> {
        DevelopmentTreeViewProvider.instance.refresh(treeItem);
    }
}
