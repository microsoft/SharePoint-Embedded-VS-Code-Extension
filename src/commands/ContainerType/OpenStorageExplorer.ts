/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocalRegistrationTreeItem } from '../../views/treeview/development/LocalRegistrationTreeItem';
import { StorageExplorerPanel } from '../../views/StorageExplorer/StorageExplorerPanel';
import { Command } from '../Command';

// Opens (or reveals) the Storage Explorer webview for a container type registration.
export class OpenStorageExplorer extends Command {
    public static readonly COMMAND = 'ContainerType.openStorageExplorer';

    public static async run(treeItem?: LocalRegistrationTreeItem): Promise<void> {
        if (!treeItem) {
            return;
        }

        StorageExplorerPanel.open(treeItem.containerType, treeItem.registration);
    }
}
