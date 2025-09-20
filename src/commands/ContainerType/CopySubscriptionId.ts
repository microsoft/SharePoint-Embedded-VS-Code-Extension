/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';

// Static class that handles the copy subscription id command
export class CopySubscriptionId extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.copySubscriptionId';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        console.log('CopySubscriptionId command not implemented yet');
    }
}
