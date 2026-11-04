/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { clientId } from '../client';
import { GraphProvider } from '../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';
import { REQUIRED_DELEGATED_PERMISSIONS } from './ExtensionAppPermissionScopes';
import type { ContainerTypeAppPermission } from '../models/schemas';

export { REQUIRED_DELEGATED_PERMISSIONS };
export {
    calculateCapabilities,
    hasCapability,
    missingCapabilitiesForOperation,
    requiredCapabilitiesForOperation,
    OPERATION_REQUIRED_CAPABILITIES,
    PERMISSION_MANAGEMENT_CAPABILITIES,
} from './ExtensionAppPermissionScopes';
export type { StorageExplorerCapability } from './ExtensionAppPermissionScopes';

/**
 * Read the delegated scopes the 1P extension app currently holds on a container type.
 *
 * Returns the raw grant so callers can evaluate operation-specific capabilities themselves;
 * {@link checkExtensionAppPermissions} answers only the coarse "is the baseline in place"
 * question. Throws when the lookup fails — a missing answer must not read as "nothing
 * granted", which would deny every operation for an unrelated Graph outage.
 */
export async function readGrantedExtensionAppScopes(
    containerTypeId: string
): Promise<ContainerTypeAppPermission[]> {
    const graphProvider = GraphProvider.getInstance();
    try {
        const grant = await graphProvider.appPermissionGrants.get(containerTypeId, clientId);
        return (grant?.delegatedPermissions ?? []) as ContainerTypeAppPermission[];
    } catch (error: any) {
        // "No grant at all" is a definite answer, not a failed lookup.
        if (error?.statusCode === 404 || error?.code === 'itemNotFound') { return []; }
        throw error;
    }
}

/**
 * Check whether the 1P extension app already has the required delegated
 * permissions on the given container type.
 *
 * Returns `false` when the lookup itself fails, so callers that only need a
 * yes/no answer stay simple. Use {@link checkExtensionAppPermissions} when
 * "couldn't tell" must be distinguishable from "not granted".
 */
export async function hasExtensionAppPermissions(containerTypeId: string): Promise<boolean> {
    try {
        return await checkExtensionAppPermissions(containerTypeId);
    } catch (error: any) {
        console.warn('[ExtensionAppPermissions] Error checking permissions:', error.message || error);
        return false;
    }
}

/**
 * Strict form of {@link hasExtensionAppPermissions}: **throws** if the grant cannot be
 * read, instead of reporting it as "not granted".
 *
 * Callers that turn a negative answer into a user-facing diagnosis need this distinction —
 * telling someone their extension app lacks permissions when the lookup merely failed
 * sends them down the wrong path.
 */
export async function checkExtensionAppPermissions(containerTypeId: string): Promise<boolean> {
    const graphProvider = GraphProvider.getInstance();
    const result = await graphProvider.appPermissionGrants.hasPermissions(
        containerTypeId,
        clientId,
        [],                             // no application permissions required
        REQUIRED_DELEGATED_PERMISSIONS
    );
    return result.hasDelegated;
}

/**
 * Grant the required delegated permissions to the 1P extension app.
 * Uses PUT (createOrReplace) so it is idempotent. Throws on failure so
 * callers can surface the underlying server error to the user.
 */
export async function grantExtensionAppPermissions(containerTypeId: string): Promise<void> {
    console.log(`[ExtensionAppPermissions] Granting delegated permissions to extension app (${clientId}) on container type ${containerTypeId}`);

    const graphProvider = GraphProvider.getInstance();
    await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, clientId, {
        appId: clientId,
        delegatedPermissions: REQUIRED_DELEGATED_PERMISSIONS,
        applicationPermissions: []
    });

    console.log('[ExtensionAppPermissions] Permissions granted successfully');
}

/**
 * Ensure the 1P extension app has the required delegated permissions on a
 * container type.  If permissions are missing the user is prompted; if they
 * accept, the permissions are granted automatically.
 *
 * This is the single prompt for the grant — the Development tree view, a denied
 * Storage Explorer call, and the Storage Explorer's "Grant permissions" button all
 * route through here so the user sees the same dialog wherever they hit it.
 *
 * @returns `true` if permissions are present (or were just granted), `false`
 *          if the user declined or the grant failed.
 */
export async function ensureExtensionAppPermissions(containerTypeId: string): Promise<boolean> {
    const has = await hasExtensionAppPermissions(containerTypeId);
    if (has) {
        return true;
    }

    const grant = vscode.l10n.t('Grant permissions');
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('Container operations require the SharePoint Embedded extension to have delegated permissions on this container type. Grant permissions now?'),
        grant
    );

    if (choice !== grant) {
        return false;
    }

    try {
        await grantExtensionAppPermissions(containerTypeId);
        DevelopmentTreeViewProvider.getInstance().refresh();
        return true;
    } catch (error: any) {
        console.warn('[ExtensionAppPermissions] Failed to grant permissions:', error?.message || error);
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to grant extension app permissions: {0}', error?.message || String(error))
        );
        return false;
    }
}
