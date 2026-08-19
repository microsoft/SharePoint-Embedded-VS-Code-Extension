/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { StorageExplorerOperation } from './protocol';

/**
 * Runtime validation for every operation the Storage Explorer webview may request.
 *
 * The webview is semi-trusted: a compromised bundled dependency can post arbitrary
 * messages. Parameters are therefore parsed (and unknown keys stripped) before any
 * Graph call is made, and operations not present in this table are rejected outright.
 */

/**
 * Characters that would let an identifier escape the path segment it is interpolated
 * into: path separators and traversal (`/`, `\`), percent-encoding (`%`, which would
 * allow `%2e%2e%2f`), query/fragment introducers (`?`, `#`), the `:` used by Graph's
 * `root:/path:/content` addressing, and whitespace/control characters.
 *
 * Real Graph identifiers (container `b!…` ids, driveItem ids, GUIDs, `1.0` version
 * ids, base64 permission ids) contain none of these.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_ID_CHARS = /[/\\%?#:\s\u0000-\u001f\u007f]/;

/**
 * An identifier that is interpolated into a Graph request path.
 *
 * Without this constraint an operation such as `containers.get` could be handed
 * `../../../applications/{id}/addPassword` and reach an arbitrary Graph endpoint,
 * defeating the whole point of the operation allow-list.
 */
const id = z
    .string()
    .min(1)
    .max(512)
    .refine(value => !UNSAFE_ID_CHARS.test(value) && value !== '.' && value !== '..', {
        message: 'Identifier contains characters that are not allowed in a Graph resource id',
    });

const optionalId = id.optional();
const nullableParentId = id.nullable();
const looseObject = z.record(z.string(), z.unknown());
const empty = z.object({});

/**
 * A people-picker search term. Quotes and backslashes are removed so the value
 * cannot break out of the OData `$search="…"` expression it is embedded in.
 */
const searchQuery = z
    .string()
    .max(256)
    .transform(value => value.replace(/["'\\]/g, '').trim());

/** Upper bound for a single-PUT upload; mirrors `DriveGraphService.SMALL_FILE_THRESHOLD`. */
const MAX_SMALL_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Accepts the several shapes a byte payload can take after crossing the webview boundary. */
const bytes = z
    .custom<Uint8Array | ArrayBuffer | number[]>(
        value => value instanceof Uint8Array || value instanceof ArrayBuffer || Array.isArray(value),
        { message: 'Expected binary content' }
    )
    .transform(value => {
        if (value instanceof Uint8Array) { return value; }
        if (value instanceof ArrayBuffer) { return new Uint8Array(value); }
        return Uint8Array.from(value as number[]);
    })
    .refine(value => value.byteLength <= MAX_SMALL_UPLOAD_BYTES, {
        message: `Single-request uploads are limited to ${MAX_SMALL_UPLOAD_BYTES} bytes; use an upload session`,
    });

/* eslint-disable @typescript-eslint/naming-convention -- keys are dotted operation ids, not identifiers */
export const OPERATION_SCHEMAS = {
    // ── containers ────────────────────────────────────────────────────────────
    'containers.list': empty,
    'containers.get': z.object({ containerId: id }),
    'containers.create': z.object({ displayName: z.string().min(1), description: z.string().optional() }),
    'containers.activate': z.object({ containerId: id }),
    'containers.rename': z.object({ containerId: id, displayName: z.string().min(1) }),
    'containers.updateDescription': z.object({ containerId: id, description: z.string() }),
    'containers.delete': z.object({ containerId: id }),
    'containers.listDeleted': empty,
    'containers.restore': z.object({ containerId: id }),
    'containers.permanentlyDelete': z.object({ containerId: id }),
    'containers.getSettings': z.object({ containerId: id }),
    'containers.updateSettings': z.object({ containerId: id, settings: looseObject }),
    'containers.getCustomProperties': z.object({ containerId: id }),
    'containers.setCustomProperty': z.object({
        containerId: id,
        key: z.string().min(1),
        value: z.string(),
        isSearchable: z.boolean(),
    }),
    'containers.deleteCustomProperty': z.object({ containerId: id, key: z.string().min(1) }),

    'collections.loadMore': z.object({
        continuation: z.string().min(1).max(256),
        scope: z.object({
            kind: z.enum(['containers', 'deletedContainers', 'driveChildren', 'recycleBin']),
            containerId: optionalId,
            itemId: optionalId,
        }),
    }),

    // ── drive ─────────────────────────────────────────────────────────────────
    'drive.listChildren': z.object({ driveId: id, itemId: optionalId }),
    'drive.get': z.object({ driveId: id, itemId: id }),
    'drive.getDetailedDriveItem': z.object({ driveId: id, itemId: id }),
    'drive.createFolder': z.object({ driveId: id, parentId: nullableParentId, name: z.string().min(1) }),
    'drive.createFile': z.object({ driveId: id, parentId: nullableParentId, name: z.string().min(1) }),
    'drive.rename': z.object({ driveId: id, itemId: id, newName: z.string().min(1) }),
    'drive.delete': z.object({ driveId: id, itemId: id }),
    'drive.uploadSmall': z.object({
        driveId: id,
        parentId: nullableParentId,
        fileName: z.string().min(1),
        contentType: z.string(),
        bytes,
    }),
    'drive.createUploadSession': z.object({ driveId: id, parentId: nullableParentId, fileName: z.string().min(1) }),
    'drive.listRecycleBin': z.object({ containerId: id }),
    'drive.restoreFromRecycleBin': z.object({ containerId: id, itemId: id }),
    'drive.permanentlyDelete': z.object({ containerId: id, itemId: id }),
    'drive.getFields': z.object({ driveId: id, itemId: id }),
    'drive.updateFields': z.object({ driveId: id, itemId: id, fields: looseObject }),
    'drive.listVersions': z.object({ driveId: id, itemId: id }),
    'drive.getVersionDownloadUrl': z.object({ driveId: id, itemId: id, versionId: id }),
    'drive.restoreVersion': z.object({ driveId: id, itemId: id, versionId: id }),
    'drive.deleteVersion': z.object({ driveId: id, itemId: id, versionId: id }),
    'drive.getItemWebUrl': z.object({ driveId: id, itemId: optionalId }),
    'drive.getDownloadUrl': z.object({ driveId: id, itemId: id }),
    'drive.getPreviewUrl': z.object({ driveId: id, itemId: id }),

    // ── permissions ───────────────────────────────────────────────────────────
    'permissions.listItemPermissions': z.object({ driveId: id, itemId: id }),
    'permissions.createSharingLink': z.object({
        driveId: id,
        itemId: id,
        type: z.string().min(1),
        scope: z.string().min(1),
        expirationDate: z.string().optional(),
        preventDownload: z.boolean().optional(),
    }),
    'permissions.inviteToItem': z.object({
        driveId: id,
        itemId: id,
        emails: z.array(z.string().min(1)),
        role: z.string().min(1),
        requireSignIn: z.boolean(),
        sendInvitation: z.boolean(),
        expirationDate: z.string().optional(),
    }),
    'permissions.updateItemPermission': z.object({
        driveId: id,
        itemId: id,
        permissionId: id,
        patch: looseObject,
    }),
    'permissions.deleteItemPermission': z.object({ driveId: id, itemId: id, permissionId: id }),
    'permissions.listContainerPermissions': z.object({ containerId: id }),
    'permissions.addContainerPermission': z.object({
        containerId: id,
        member: z.object({
            id: z.string(),
            displayName: z.string(),
            email: z.string(),
            userPrincipalName: z.string().optional(),
            kind: z.enum(['user', 'group']),
        }),
        role: z.enum(['owner', 'manager', 'writer', 'reader']),
    }),
    'permissions.updateContainerPermission': z.object({
        containerId: id,
        permissionId: id,
        role: z.enum(['owner', 'manager', 'writer', 'reader']),
    }),
    'permissions.deleteContainerPermission': z.object({ containerId: id, permissionId: id }),

    // ── columns ───────────────────────────────────────────────────────────────
    'columns.listContainerColumns': z.object({ containerId: id }),
    'columns.createContainerColumn': z.object({ containerId: id, column: looseObject }),
    'columns.updateContainerColumn': z.object({ containerId: id, columnId: id, column: looseObject }),
    'columns.deleteContainerColumn': z.object({ containerId: id, columnId: id }),
    'columns.getItemFields': z.object({ driveId: id, itemId: id }),
    'columns.updateItemFields': z.object({ driveId: id, itemId: id, fields: looseObject }),

    // ── people ────────────────────────────────────────────────────────────────
    'people.searchUsers': z.object({ query: searchQuery }),
    'people.searchGroups': z.object({ query: searchQuery }),
    'people.search': z.object({ query: searchQuery }),

    // ── me ────────────────────────────────────────────────────────────────────
    'me.get': empty,
} satisfies Record<StorageExplorerOperation, z.ZodType>;
/* eslint-enable @typescript-eslint/naming-convention */

/** Type guard narrowing an arbitrary string from the webview to a known operation. */
export function isStorageExplorerOperation(value: unknown): value is StorageExplorerOperation {
    return typeof value === 'string' &&
        Object.prototype.hasOwnProperty.call(OPERATION_SCHEMAS, value);
}
