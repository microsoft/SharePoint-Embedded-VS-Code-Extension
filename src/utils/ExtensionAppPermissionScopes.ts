/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerTypeAppPermission } from '../models/schemas';
import type { StorageExplorerOperation } from '../services/StorageExplorer/protocol';

/**
 * Delegated permissions the 1P extension app needs on a container type for the guided
 * Storage Explorer workflow: enumerate and mutate containers, read and write their
 * content, and manage container permissions.
 *
 * Kept in its own module — free of `vscode` and of any provider singletons — so the
 * standalone webview harness and the Node-only test suites can import it without
 * dragging in the extension host.
 */
export const REQUIRED_DELEGATED_PERMISSIONS: ContainerTypeAppPermission[] = [
    'read',
    'write',
    'create',
    'delete',
    'readContent',
    'writeContent',
    'managePermissions'
];

/**
 * Whether a grant satisfies the coarse, all-or-nothing baseline the Development tree checks.
 *
 * Deliberately mirrors `ContainerTypeAppPermissionGrantService.hasPermissions` for
 * {@link REQUIRED_DELEGATED_PERMISSIONS}, so a caller that has already read the grant can
 * reach the tree's verdict without spending a second Graph request. The two must stay in
 * agreement: this is what lets the Storage Explorer panel decide the tree row is stale.
 *
 * This is *not* the per-operation gate — a partial grant fails this while still permitting
 * several operations. Use {@link missingCapabilitiesForOperation} for that.
 */
export function satisfiesExtensionAppBaseline(
    granted: readonly ContainerTypeAppPermission[] | undefined | null
): boolean {
    const scopes = granted ?? [];
    return scopes.includes('full')
        || REQUIRED_DELEGATED_PERMISSIONS.every(scope => scopes.includes(scope));
}

/**
 * The capabilities a Storage Explorer operation can require.
 *
 * A strict subset of {@link ContainerTypeAppPermission}: `none` is not a capability, and
 * `manageContent` is not part of the guided workflow.
 */
export type StorageExplorerCapability =
    | 'read'
    | 'write'
    | 'create'
    | 'delete'
    | 'readContent'
    | 'writeContent'
    | 'enumeratePermissions'
    | 'addPermissions'
    | 'updatePermissions'
    | 'deletePermissions'
    | 'deleteOwnPermission'
    | 'managePermissions';

/**
 * Permission-management capabilities that a single `managePermissions` grant satisfies.
 *
 * Graph models `managePermissions` as the umbrella scope over the four granular permission
 * scopes plus `deleteOwnPermission`, so a tenant that granted only the umbrella must not be
 * told it is missing the granular ones.
 */
export const PERMISSION_MANAGEMENT_CAPABILITIES: readonly StorageExplorerCapability[] = [
    'enumeratePermissions',
    'addPermissions',
    'updatePermissions',
    'deletePermissions',
    'deleteOwnPermission',
    'managePermissions'
];

/**
 * Every capability the matrix can require.
 *
 * Doubles as the expansion of Graph's `full` umbrella and as the filter that keeps scopes the
 * matrix never names — `manageContent`, `unknownFutureValue` — out of the capability set.
 */
export const STORAGE_EXPLORER_CAPABILITIES: readonly StorageExplorerCapability[] = [
    'read',
    'write',
    'create',
    'delete',
    'readContent',
    'writeContent',
    ...PERMISSION_MANAGEMENT_CAPABILITIES
];

/** Scopes Graph treats as umbrellas, mapped to the capabilities each one confers. */
const UMBRELLA_SCOPES: Readonly<Record<string, readonly StorageExplorerCapability[]>> = {
    // `full` is complete control over the container type. `ContainerTypeAppPermissionGrantService`
    // already accepts it in place of any required scope, and the two must agree: if this
    // calculation did not expand it, a tenant that granted `full` would be told it was missing
    // every scope and would find the whole Storage Explorer disabled.
    /* eslint-disable-next-line @typescript-eslint/naming-convention -- Graph scope name */
    full: STORAGE_EXPLORER_CAPABILITIES,
    // Graph models `managePermissions` as the umbrella over the four granular permission
    // scopes plus `deleteOwnPermission`.
    /* eslint-disable-next-line @typescript-eslint/naming-convention -- Graph scope name */
    managePermissions: PERMISSION_MANAGEMENT_CAPABILITIES,
};

/**
 * Expand a raw grant into the set of capabilities it confers.
 *
 * Only the expansions Graph itself applies are encoded here (see {@link UMBRELLA_SCOPES}).
 * Nothing else is inferred: quietly widening a partial grant would let a call through that
 * the service will deny. Scopes outside {@link STORAGE_EXPLORER_CAPABILITIES} are ignored
 * rather than passed through, so a scope the matrix never names can never satisfy a
 * requirement by accident.
 */
export function calculateCapabilities(
    granted: readonly ContainerTypeAppPermission[] | undefined | null
): Set<StorageExplorerCapability> {
    const capabilities = new Set<StorageExplorerCapability>();
    for (const permission of granted ?? []) {
        if (permission === 'none') { continue; }
        const implied = UMBRELLA_SCOPES[permission];
        if (implied) {
            for (const capability of implied) { capabilities.add(capability); }
            continue;
        }
        if ((STORAGE_EXPLORER_CAPABILITIES as readonly string[]).includes(permission)) {
            capabilities.add(permission as StorageExplorerCapability);
        }
    }
    return capabilities;
}

/** True when `granted` confers `capability`, taking `managePermissions` into account. */
export function hasCapability(
    granted: readonly ContainerTypeAppPermission[] | undefined | null,
    capability: StorageExplorerCapability
): boolean {
    return calculateCapabilities(granted).has(capability);
}

/**
 * The capability each Storage Explorer operation requires before Graph is called.
 *
 * An empty list means the operation touches no container-type-scoped resource (directory
 * look-ups and the signed-in user), so no container-type grant gates it.
 *
 * `collections.loadMore` is gated as a read: it only ever continues a listing the host
 * already authorized, and the host re-derives the concrete collection from its own
 * continuation record rather than from the webview.
 */
/* eslint-disable @typescript-eslint/naming-convention -- keys are dotted operation ids, not identifiers */
export const OPERATION_REQUIRED_CAPABILITIES: Record<StorageExplorerOperation, readonly StorageExplorerCapability[]> = {
    // ── authorization ────────────────────────────────────────────────────────
    'authorization.get': [],

    // ── containers ────────────────────────────────────────────────────────────
    'containers.list': ['read'],
    'containers.get': ['read'],
    'containers.create': ['create'],
    'containers.activate': ['write'],
    'containers.rename': ['write'],
    'containers.updateDescription': ['write'],
    'containers.delete': ['delete'],
    'containers.listDeleted': ['read'],
    'containers.restore': ['write'],
    'containers.permanentlyDelete': ['delete'],
    'containers.getSettings': ['read'],
    'containers.updateSettings': ['write'],
    'containers.getCustomProperties': ['read'],
    'containers.setCustomProperty': ['write'],
    'containers.deleteCustomProperty': ['write'],

    // ── collections ───────────────────────────────────────────────────────────
    'collections.loadMore': ['read'],

    // ── drive ─────────────────────────────────────────────────────────────────
    'drive.listChildren': ['read'],
    'drive.get': ['read'],
    'drive.getDetailedDriveItem': ['read'],
    'drive.createFolder': ['writeContent'],
    'drive.createFile': ['writeContent'],
    'drive.rename': ['write'],
    'drive.delete': ['delete'],
    'drive.uploadSmall': ['writeContent'],
    'drive.createUploadSession': ['writeContent'],
    'drive.listRecycleBin': ['read'],
    'drive.restoreFromRecycleBin': ['write'],
    'drive.permanentlyDelete': ['delete'],
    'drive.getFields': ['read'],
    'drive.updateFields': ['write'],
    'drive.listVersions': ['read'],
    'drive.getVersionDownloadUrl': ['readContent'],
    'drive.restoreVersion': ['write'],
    'drive.deleteVersion': ['delete'],
    'drive.getItemWebUrl': ['read'],
    'drive.getDownloadUrl': ['readContent'],
    'drive.getPreviewUrl': ['readContent'],

    // ── permissions ───────────────────────────────────────────────────────────
    'permissions.listItemPermissions': ['enumeratePermissions'],
    'permissions.createSharingLink': ['addPermissions'],
    'permissions.inviteToItem': ['addPermissions'],
    'permissions.updateItemPermission': ['updatePermissions'],
    'permissions.deleteItemPermission': ['deletePermissions'],
    'permissions.listContainerPermissions': ['enumeratePermissions'],
    'permissions.addContainerPermission': ['addPermissions'],
    'permissions.updateContainerPermission': ['updatePermissions'],
    'permissions.deleteContainerPermission': ['deletePermissions'],

    // ── columns ───────────────────────────────────────────────────────────────
    'columns.listContainerColumns': ['read'],
    'columns.createContainerColumn': ['write'],
    'columns.updateContainerColumn': ['write'],
    'columns.deleteContainerColumn': ['delete'],
    'columns.getItemFields': ['read'],
    'columns.updateItemFields': ['write'],

    // ── people ────────────────────────────────────────────────────────────────
    'people.searchUsers': [],
    'people.searchGroups': [],
    'people.search': [],

    // ── me ────────────────────────────────────────────────────────────────────
    'me.get': [],
};
/* eslint-enable @typescript-eslint/naming-convention */

/** Capabilities `operation` requires before any Graph call is issued. */
export function requiredCapabilitiesForOperation(
    operation: StorageExplorerOperation
): readonly StorageExplorerCapability[] {
    return OPERATION_REQUIRED_CAPABILITIES[operation] ?? [];
}

/**
 * Capabilities `operation` needs that `granted` does not confer.
 *
 * An empty array means the call is authorized. The returned values are scope *names* only,
 * so they are safe to hand to the webview, which uses them to name the missing grant.
 */
export function missingCapabilitiesForOperation(
    operation: StorageExplorerOperation,
    granted: readonly ContainerTypeAppPermission[] | undefined | null
): StorageExplorerCapability[] {
    const capabilities = calculateCapabilities(granted);
    return requiredCapabilitiesForOperation(operation).filter(required => !capabilities.has(required));
}
