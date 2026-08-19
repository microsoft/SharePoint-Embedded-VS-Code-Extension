/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocalRegistrationTreeItem } from '../../views/treeview/development/LocalRegistrationTreeItem';
import { StorageExplorerTreeItem } from '../../views/treeview/development/StorageExplorerTreeItem';
import { StorageExplorerPanel } from '../../views/StorageExplorer/StorageExplorerPanel';
import { Command } from '../Command';

/**
 * Opens (or reveals) the Storage Explorer webview for a container type.
 *
 * Accepts the Storage Explorer tree row — which exists for every container type, ready or
 * not — as well as the registration row it used to hang off. A blocked container type still
 * opens: the panel renders the onboarding surface for its readiness state and issues no
 * container or file operations.
 */
export class OpenStorageExplorer extends Command {
    public static readonly COMMAND = 'ContainerType.openStorageExplorer';

    public static async run(treeItem?: StorageExplorerTreeItem | LocalRegistrationTreeItem): Promise<void> {
        if (!treeItem) {
            return;
        }

        if (treeItem instanceof StorageExplorerTreeItem) {
            await StorageExplorerPanel.open(treeItem.containerType, treeItem.registration, treeItem.readiness);
            return;
        }

        await StorageExplorerPanel.open(treeItem.containerType, treeItem.registration);
    }
}
