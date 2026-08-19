/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerType, ContainerTypeRegistration } from '../../models/schemas';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { hasExtensionAppPermissions } from '../../utils/ExtensionAppPermissions';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { StorageExplorerPanel } from '../../views/StorageExplorer/StorageExplorerPanel';
import { computeStorageExplorerReadiness } from '../../views/treeview/development/storageExplorerReadiness';

/**
 * Refresh the Development tree and, once a container type has become usable, take the user
 * straight to Storage Explorer.
 *
 * Setup is two independent steps — registering on the local tenant and granting the
 * extension app its delegated permissions — and either can be done first. Both call this
 * afterwards, and only the one that completes the pair opens anything, so the user lands in
 * Storage Explorer exactly once instead of being left on a tree row wondering what is next.
 *
 * Never opens a blocked panel: an incomplete state stays on the tree row, which already
 * names the remaining step.
 *
 * @returns `true` when Storage Explorer was opened or revealed.
 */
export async function openStorageExplorerWhenReady(
    containerType: ContainerType,
    registration?: ContainerTypeRegistration | null
): Promise<boolean> {
    // The readiness that decides the hand-off is also what the tree row renders, so refresh
    // first: VS Code must not keep showing "register to use" on a container type we are
    // about to open.
    DevelopmentTreeViewProvider.getInstance().refresh();

    let resolved = registration ?? null;
    if (!resolved) {
        try {
            resolved = await GraphProvider.getInstance().registrations.get(containerType.id);
        } catch (error) {
            // Not registered yet, or the lookup failed. Either way there is nothing to open;
            // the tree row remains the place that names the next step.
            return false;
        }
    }

    const readiness = computeStorageExplorerReadiness(
        containerType,
        resolved,
        resolved ? await hasExtensionAppPermissions(containerType.id) : false
    );
    if (readiness !== 'ready') {
        return false;
    }

    await StorageExplorerPanel.open(containerType, resolved, 'ready');
    return true;
}
