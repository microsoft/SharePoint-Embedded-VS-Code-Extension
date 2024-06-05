/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import { RecycledContainerTreeItem } from '../../views/treeview/development/RecycledContainerTreeItem';
import { Commands } from '..';

// Static class that handles the copy container type id command
export class CopyRecycledContainerId extends Command {
    // Command name
    public static readonly COMMAND = 'RecycledContainer.copyId';

    // Command handler
    public static async run(containerViewModel?: RecycledContainerTreeItem): Promise<void> {
        await Commands.CopyContainerId.run(containerViewModel);
    }
}
