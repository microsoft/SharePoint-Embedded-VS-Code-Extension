/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared contract between the Storage Explorer webview and the extension host.
 *
 * This file is imported by BOTH TypeScript projects (`src/` and `webview-ui/src/`),
 * so it must stay free of any runtime code and of any environment-specific imports
 * (no `vscode`, no DOM globals, no Node globals). Types only.
 *
 * Security note: the delegated Microsoft Graph bearer token never crosses this
 * boundary. The webview sends *intent* (a named operation plus its parameters) and
 * the extension host performs the Graph call. See `StorageExplorerApi` on the host.
 */

import type {
    ColumnDefinition,
    FileStorageContainerCustomPropertyValue,
    FileStorageContainerSettings,
    Permission,
    User,
} from '@microsoft/microsoft-graph-types';

// ── Domain types ──────────────────────────────────────────────────────────────

export type ItemKind = 'container' | 'folder' | 'file';

export interface StorageItem {
    id: string;
    name: string;
    kind: ItemKind;
    modifiedAt: string;
    /**
     * `modifiedAt` as epoch milliseconds, for ordering.
     *
     * `modifiedAt` is a localized display string ("Sep 1, 2025, 12:00 AM"), so comparing it
     * as text orders rows by month name rather than by date. This field carries the value the
     * fixed newest-first ordering actually sorts on. Absent when the source had no timestamp.
     */
    modifiedTs?: number;
    type: string;
    size: string;
    /**
     * Raw size in bytes, used for correct numeric sorting.
     * `size` is a pre-formatted display string (e.g. "2 MB") and must NOT be
     * used for comparisons. 0 for folders/containers without a known size.
     */
    sizeBytes?: number;
    description?: string;
    mimeType?: string;
    // Container-specific fields
    containerTypeId?: string;
    createdAt?: string;
    deletedAt?: string;
    lockState?: 'unlocked' | 'lockedReadOnly' | null;
    status?: 'active' | 'inactive' | null;
    sensitivityLabel?: { id?: string; displayName?: string } | null;
    /**
     * Browser-facing URL for the item (`DriveItem.webUrl` / `BaseItem.webUrl`).
     * Opens Office files in the browser viewer; acts as a direct link for
     * other file types.
     */
    webUrl?: string;
    /**
     * Pre-authenticated temporary download URL.
     * Sourced from the `@microsoft.graph.downloadUrl` OData annotation,
     * which Graph returns when the field is explicitly `$select`-ed.
     * Expires after a short time — do not cache long-term.
     */
    downloadUrl?: string;
    /**
     * Embedded preview / view URL returned by `POST /driveItem/preview`
     * (`ItemPreviewInfo.getUrl`). Populated on demand after a preview call;
     * not available from a normal listing response.
     */
    previewUrl?: string;
}

export interface NetworkRequest {
    id: string;
    method: string;
    url: string;
    /** HTTP status code, or 0 if the request failed/is pending */
    status: number;
    statusText: string;
    /** Duration in milliseconds */
    durationMs: number;
    timestamp: string; // ISO 8601
    requestHeaders: Record<string, string>;
    requestBody?: string;
    responseHeaders: Record<string, string>;
    responseBody?: string;
    error?: string;
}

/** Rich details for the file properties panel. */
export interface DriveItemDetails {
    id: string;
    name: string;
    isFolder: boolean;
    size?: number;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    webUrl?: string;
    webDavUrl?: string;
    downloadUrl?: string;
    mimeType?: string;
    childCount?: number;
    parentId?: string;
    sharepointIds?: Record<string, string>;
    publication?: {
        level?: string;
        versionId?: string;
        checkedOutBy?: { user?: { displayName?: string; email?: string } };
    };
    malware?: { description?: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    retentionLabel?: { name?: string; [key: string]: any } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audio?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    image?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    photo?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    video?: Record<string, any>;
}

/** Version shape returned by Graph for a drive item. */
export interface DriveItemVersion {
    id?: string;
    size?: number;
    lastModifiedDateTime?: string;
    lastModifiedBy?: { user?: { displayName?: string; email?: string } };
    published?: { level?: string; versionId?: string };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
    '@microsoft.graph.downloadUrl'?: string;
}

/** SPE container permission roles (not modelled as an enum in graph-types). */
export type ContainerRole = 'owner' | 'manager' | 'writer' | 'reader';

/**
 * People-picker suggestion item for the UI autocomplete — a minimal
 * projection of a Graph User or Group resource.
 */
export interface PeopleSuggestion {
    id: string;
    displayName: string;
    /**
     * Contact / invitation email address. May differ from `userPrincipalName`
     * in federated or multi-domain tenants.
     */
    email: string;
    /**
     * Azure AD user principal name (sign-in name). Undefined for groups,
     * which don't have a UPN.
     */
    userPrincipalName?: string;
    kind: 'user' | 'group';
}

/**
 * Typed container custom properties dictionary.
 * Mirrors `GET /storage/fileStorage/containers/{id}/customProperties`.
 */
export type ContainerCustomProperties = Record<string, FileStorageContainerCustomPropertyValue>;

export type CurrentUser = Pick<User, 'id' | 'displayName' | 'mail' | 'userPrincipalName'>;

/** Result of a single chunk PUT against a pre-authenticated upload session URL. */
export interface UploadChunkResult {
    done: boolean;
    nextOffset: number;
    item?: StorageItem;
}

/**
 * Host-derived authorization state for the current container type.
 *
 * Only missing scope names are exposed, keyed by the allow-listed operation that needs
 * them. The grant document, app identity, tenant identity, and bearer token stay host-only.
 */
export interface AuthorizationSnapshot {
    missingScopesByOperation: Record<string, string[]>;
}

// ── Paging ────────────────────────────────────────────────────────────────────

/**
 * Opaque handle to "there is another server page for this collection".
 *
 * It is **not** a Graph `@odata.nextLink`. The host mints a random identifier, keeps the
 * real link in its own memory, and binds the identifier to the panel, the collection kind,
 * the container, and the folder it was issued for. A webview therefore cannot read a Graph
 * URL out of it, cannot forge one, and cannot replay one against a different view.
 */
export type ContinuationToken = string;

/** The Storage Explorer collections that page one server page at a time. */
export type StorageCollectionKind =
    | 'containers'
    | 'deletedContainers'
    | 'driveChildren'
    | 'recycleBin';

/**
 * The exact view a continuation belongs to.
 *
 * `collections.loadMore` carries the scope the webview believes it is in; the host compares
 * it with the scope recorded when the token was issued and rejects a mismatch, so a token
 * left over from another folder, recycle view, or root listing cannot append into the
 * current one.
 */
export interface CollectionScope {
    kind: StorageCollectionKind;
    /** Container (= drive) id. Absent for the container-type-scoped collections. */
    containerId?: string;
    /** Folder item id for a nested drive listing. Absent at the drive root. */
    itemId?: string;
}

/** One server page plus the handle to the next one, when the server said there is one. */
export interface PagedResult<T> {
    items: T[];
    /** Absent once the server returned the final page. */
    continuation?: ContinuationToken;
}

// ── Operation contract ────────────────────────────────────────────────────────

/**
 * The complete set of Graph operations the webview may ask the host to perform.
 *
 * This is deliberately an allow-list of *named, typed* operations rather than a
 * generic `{ url, method }` passthrough: a compromised webview dependency can only
 * invoke what is enumerated here, and only for the lifetime of the panel.
 *
 * Operations scoped to the panel's container type (`containers.list`,
 * `containers.listDeleted`, `containers.create`) intentionally take no
 * `containerTypeId` — the host injects the value it captured when the panel was
 * opened, so the webview cannot repoint the call at another container type.
 */
/* eslint-disable @typescript-eslint/naming-convention -- operation ids are dotted string literals, not identifiers */
export interface StorageExplorerOperations {
    // ── authorization ─────────────────────────────────────────────────────────
    'authorization.get': { params: Record<string, never>; result: AuthorizationSnapshot };

    // ── containers ────────────────────────────────────────────────────────────
    'containers.list': { params: Record<string, never>; result: PagedResult<StorageItem> };
    'containers.get': { params: { containerId: string }; result: StorageItem | null };
    'containers.create': { params: { displayName: string; description?: string }; result: StorageItem };
    'containers.activate': { params: { containerId: string }; result: void };
    'containers.rename': { params: { containerId: string; displayName: string }; result: void };
    'containers.updateDescription': { params: { containerId: string; description: string }; result: void };
    'containers.delete': { params: { containerId: string }; result: void };
    'containers.listDeleted': { params: Record<string, never>; result: PagedResult<StorageItem> };
    'containers.restore': { params: { containerId: string }; result: void };
    'containers.permanentlyDelete': { params: { containerId: string }; result: void };
    'containers.getSettings': { params: { containerId: string }; result: FileStorageContainerSettings };
    'containers.updateSettings': { params: { containerId: string; settings: Partial<FileStorageContainerSettings> }; result: void };
    'containers.getCustomProperties': { params: { containerId: string }; result: ContainerCustomProperties };
    'containers.setCustomProperty': { params: { containerId: string; key: string; value: string; isSearchable: boolean }; result: void };
    'containers.deleteCustomProperty': { params: { containerId: string; key: string }; result: void };

    // ── collections ───────────────────────────────────────────────────────────
    /**
     * Fetch exactly one more server page for a collection already listed by this panel.
     *
     * Never issued implicitly: only an explicit user action ("Load more") reaches here, so a
     * first page stays a first page until the user asks for the next one.
     */
    'collections.loadMore': {
        params: { continuation: ContinuationToken; scope: CollectionScope };
        result: PagedResult<StorageItem>;
    };

    // ── drive ─────────────────────────────────────────────────────────────────
    /** Returns only the first server page; the caller asks for more via `collections.loadMore`. */
    'drive.listChildren': { params: { driveId: string; itemId?: string }; result: PagedResult<StorageItem> };
    'drive.get': { params: { driveId: string; itemId: string }; result: StorageItem | null };
    'drive.getDetailedDriveItem': { params: { driveId: string; itemId: string }; result: DriveItemDetails };
    'drive.createFolder': { params: { driveId: string; parentId: string | null; name: string }; result: StorageItem };
    'drive.createFile': { params: { driveId: string; parentId: string | null; name: string }; result: StorageItem };
    'drive.rename': { params: { driveId: string; itemId: string; newName: string }; result: void };
    'drive.delete': { params: { driveId: string; itemId: string }; result: void };
    'drive.uploadSmall': {
        params: {
            driveId: string;
            parentId: string | null;
            fileName: string;
            contentType: string;
            /** Raw file bytes, transferred as a typed array. */
            bytes: Uint8Array;
        };
        result: StorageItem;
    };
    'drive.createUploadSession': { params: { driveId: string; parentId: string | null; fileName: string }; result: string };
    'drive.listRecycleBin': { params: { containerId: string }; result: PagedResult<StorageItem> };
    'drive.restoreFromRecycleBin': { params: { containerId: string; itemId: string }; result: void };
    'drive.permanentlyDelete': { params: { containerId: string; itemId: string }; result: void };
    'drive.getFields': { params: { driveId: string; itemId: string }; result: Record<string, unknown> };
    'drive.updateFields': { params: { driveId: string; itemId: string; fields: Record<string, unknown> }; result: void };
    'drive.listVersions': { params: { driveId: string; itemId: string }; result: DriveItemVersion[] };
    'drive.getVersionDownloadUrl': { params: { driveId: string; itemId: string; versionId: string }; result: string };
    'drive.restoreVersion': { params: { driveId: string; itemId: string; versionId: string }; result: void };
    'drive.deleteVersion': { params: { driveId: string; itemId: string; versionId: string }; result: void };
    'drive.getItemWebUrl': { params: { driveId: string; itemId?: string }; result: string };
    'drive.getDownloadUrl': { params: { driveId: string; itemId: string }; result: string };
    'drive.getPreviewUrl': { params: { driveId: string; itemId: string }; result: string };

    // ── permissions ───────────────────────────────────────────────────────────
    'permissions.listItemPermissions': { params: { driveId: string; itemId: string }; result: Permission[] };
    'permissions.createSharingLink': {
        params: {
            driveId: string;
            itemId: string;
            type: string;
            scope: string;
            expirationDate?: string;
            preventDownload?: boolean;
        };
        result: Permission;
    };
    'permissions.inviteToItem': {
        params: {
            driveId: string;
            itemId: string;
            emails: string[];
            role: string;
            requireSignIn: boolean;
            sendInvitation: boolean;
            expirationDate?: string;
        };
        result: Permission[];
    };
    'permissions.updateItemPermission': { params: { driveId: string; itemId: string; permissionId: string; patch: Partial<Permission> }; result: Permission };
    'permissions.deleteItemPermission': { params: { driveId: string; itemId: string; permissionId: string }; result: void };
    'permissions.listContainerPermissions': { params: { containerId: string }; result: Permission[] };
    'permissions.addContainerPermission': { params: { containerId: string; member: PeopleSuggestion; role: ContainerRole }; result: Permission };
    'permissions.updateContainerPermission': { params: { containerId: string; permissionId: string; role: ContainerRole }; result: Permission };
    'permissions.deleteContainerPermission': { params: { containerId: string; permissionId: string }; result: void };

    // ── columns ───────────────────────────────────────────────────────────────
    'columns.listContainerColumns': { params: { containerId: string }; result: ColumnDefinition[] };
    'columns.createContainerColumn': { params: { containerId: string; column: Partial<ColumnDefinition> }; result: ColumnDefinition };
    'columns.updateContainerColumn': { params: { containerId: string; columnId: string; column: Partial<ColumnDefinition> }; result: ColumnDefinition };
    'columns.deleteContainerColumn': { params: { containerId: string; columnId: string }; result: void };
    'columns.getItemFields': { params: { driveId: string; itemId: string }; result: Record<string, unknown> };
    'columns.updateItemFields': { params: { driveId: string; itemId: string; fields: Record<string, unknown> }; result: void };

    // ── people ────────────────────────────────────────────────────────────────
    'people.searchUsers': { params: { query: string }; result: PeopleSuggestion[] };
    'people.searchGroups': { params: { query: string }; result: PeopleSuggestion[] };
    'people.search': { params: { query: string }; result: PeopleSuggestion[] };

    // ── me ────────────────────────────────────────────────────────────────────
    'me.get': { params: Record<string, never>; result: CurrentUser };
}
/* eslint-enable @typescript-eslint/naming-convention */

export type StorageExplorerOperation = keyof StorageExplorerOperations;

export type OperationParams<K extends StorageExplorerOperation> = StorageExplorerOperations[K]['params'];
export type OperationResult<K extends StorageExplorerOperation> = StorageExplorerOperations[K]['result'];

// ── Message envelopes ─────────────────────────────────────────────────────────

/** Serialized form of a host-side error. `Error` does not survive structured clone. */
export interface SerializedError {
    message: string;
    /** HTTP status code when the failure originated from a Graph response. */
    statusCode?: number;
    code?: string;
    /**
     * Container-type scope names the operation needed but the extension app was not granted.
     *
     * Present only on a `missingExtensionAppPermissions` failure. Scope *names* only — never
     * the grant itself, the principal it belongs to, or anything else about the tenant.
     */
    requiredScopes?: string[];
}

/**
 * `SerializedError.code` value meaning the call was rejected because the 1P extension
 * app has no delegated permissions on this container type — the same condition the
 * Development tree view checks via `hasExtensionAppPermissions()`.
 *
 * Declared as a type (not a runtime constant) to keep this file free of runtime code.
 * Both sides declare the literal locally and annotate it with this type, so a rename
 * on one side fails to compile on the other.
 */
export type MissingExtensionPermissionsCode = 'missingExtensionAppPermissions';

export interface RpcRequestMessage {
    command: 'rpc/request';
    requestId: string;
    op: StorageExplorerOperation;
    params: unknown;
}

export interface RpcResponseMessage {
    command: 'rpc/response';
    requestId: string;
    ok: boolean;
    result?: unknown;
    error?: SerializedError;
}

/** Incremental payload emitted while a long-running operation is still in flight. */
export interface RpcProgressMessage {
    command: 'rpc/progress';
    requestId: string;
    data: unknown;
}

/** Host-side Graph traffic, forwarded so the webview's Network drawer stays populated. */
export interface NetworkLogMessage {
    command: 'networkLog';
    request: NetworkRequest;
}

/**
 * Webview → host: the user clicked "Grant permissions" on the failed-listing state.
 *
 * Carries no parameters — the host grants only the permissions this feature requires, and
 * only on the container type the panel was opened for. The host still confirms with the
 * user before granting: the webview is semi-trusted, so a message from it is a *request*
 * to raise the prompt, never consent on the user's behalf. It raises the same prompt a
 * denied call raises, so every path to the grant looks the same to the user.
 */
export interface GrantPermissionsMessage {
    command: 'grantPermissions';
}

/**
 * Host → webview: the outcome of a grant prompt, whether it was raised automatically by a
 * diagnosed access-denied failure or by {@link GrantPermissionsMessage}.
 *
 * Always sent, including when the user declines, so the webview can drop the pending state
 * on its button instead of appearing to hang.
 */
export interface PermissionsGrantResultMessage {
    command: 'permissionsGrantResult';
    /** `true` if the permissions are now in place; the webview reloads the failed view. */
    granted: boolean;
}

export type HostToWebviewMessage =
    | RpcResponseMessage
    | RpcProgressMessage
    | NetworkLogMessage
    | PermissionsGrantResultMessage;

/** Immutable panel state injected into the webview at creation time. Contains no credentials. */
export interface StorageExplorerPanelState {
    appName: string;
    tenantDomain: string;
    containerTypeId: string;
    registrationId: string;
    /**
     * Whether this container type can serve Storage Explorer requests at all.
     *
     * Anything other than `ready` makes the webview render a disabled onboarding surface and
     * issue no collection operations, so a blocked container type costs zero Graph calls.
     */
    readiness: StorageExplorerReadiness;
    /**
     * Scope names still required when `readiness === 'missingPermissions'`.
     * Names only — the webview uses them to say which grant is missing.
     */
    requiredScopes?: string[];
}

/**
 * Why (or whether) Storage Explorer can operate on a container type.
 *
 * `unregistered` — no local tenant registration yet.
 * `missingPermissions` — registered, but the extension app lacks required delegated scopes.
 * `billingBlocked` — billing is not set up, so nothing under the container type works.
 */
export type StorageExplorerReadiness =
    | 'ready'
    | 'unregistered'
    | 'missingPermissions'
    | 'billingBlocked';
