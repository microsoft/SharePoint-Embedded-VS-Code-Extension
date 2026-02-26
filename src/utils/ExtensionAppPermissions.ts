/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { clientId } from '../client';
import { GraphProvider } from '../services/Graph/GraphProvider';
import { ContainerTypeAppPermission } from '../models/schemas';

/**
 * Required delegated permissions for the 1P extension app to perform
 * container operations (create, list, read, write, delete).
 */
export const REQUIRED_DELEGATED_PERMISSIONS: ContainerTypeAppPermission[] = [
    'readContent',
    'writeContent',
    'create',
    'delete',
    'read',
    'write'
];

/**
 * Check whether the 1P extension app already has the required delegated
 * permissions on the given container type.
 */
export async function hasExtensionAppPermissions(containerTypeId: string): Promise<boolean> {
    try {
        const graphProvider = GraphProvider.getInstance();
        const result = await graphProvider.appPermissionGrants.hasPermissions(
            containerTypeId,
            clientId,
            [],                             // no application permissions required
            REQUIRED_DELEGATED_PERMISSIONS
        );
        return result.hasDelegated;
    } catch (error: any) {
        console.warn('[ExtensionAppPermissions] Error checking permissions:', error.message || error);
        return false;
    }
}

/**
 * Grant the required delegated permissions to the 1P extension app.
 * Uses PUT (createOrReplace) so it is idempotent.
 */
export async function grantExtensionAppPermissions(containerTypeId: string): Promise<boolean> {
    try {
        console.log(`[ExtensionAppPermissions] Granting delegated permissions to extension app (${clientId}) on container type ${containerTypeId}`);

        const graphProvider = GraphProvider.getInstance();
        await graphProvider.appPermissionGrants.createOrReplace(containerTypeId, clientId, {
            appId: clientId,
            delegatedPermissions: REQUIRED_DELEGATED_PERMISSIONS,
            applicationPermissions: []
        });

        console.log('[ExtensionAppPermissions] Permissions granted successfully');
        return true;
    } catch (error: any) {
        console.warn('[ExtensionAppPermissions] Failed to grant permissions:', error.message || error);
        return false;
    }
}

/**
 * Ensure the 1P extension app has the required delegated permissions on a
 * container type.  If permissions are missing the user is prompted; if they
 * accept, the permissions are granted automatically.
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

    return grantExtensionAppPermissions(containerTypeId);
}
