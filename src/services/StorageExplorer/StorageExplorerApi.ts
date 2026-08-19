/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import type { ColumnDefinition, FileStorageContainerSettings, Permission } from '@microsoft/microsoft-graph-types';
import { ColumnGraphService } from './ColumnGraphService';
import { ContainerGraphService } from './ContainerGraphService';
import { DriveGraphService } from './DriveGraphService';
import { MeGraphService } from './MeGraphService';
import { PeopleGraphService } from './PeopleGraphService';
import { PermissionGraphService } from './PermissionGraphService';
import { isStorageExplorerOperation, OPERATION_SCHEMAS } from './operationSchemas';
import { ContinuationStore, NextLinkSink } from './pagination';
import {
    CollectionScope,
    OperationParams,
    OperationResult,
    PagedResult,
    SerializedError,
    StorageExplorerOperation,
    StorageItem,
} from './protocol';
import type { ContainerTypeAppPermission } from '../../models/schemas';
import {
    missingCapabilitiesForOperation,
    StorageExplorerCapability,
} from '../../utils/ExtensionAppPermissionScopes';

/** `SerializedError.code` the webview matches to render "permissions required". */
const MISSING_EXTENSION_PERMISSIONS_CODE = 'missingExtensionAppPermissions';

/**
 * Raised when the extension app's grant on this container type does not cover the requested
 * operation. Thrown *before* any Graph call, so a denied interaction costs zero requests and
 * cannot be mistaken for an empty collection.
 *
 * Carries scope names only — never the grant, the principal, or any other tenant detail.
 */
export class MissingContainerTypePermissionError extends Error {
    public readonly code = MISSING_EXTENSION_PERMISSIONS_CODE;
    public constructor(public readonly requiredScopes: string[]) {
        super(
            `This action needs the SharePoint Embedded extension app to have `
            + `${requiredScopes.join(', ')} permission on this container type.`
        );
        this.name = 'MissingContainerTypePermissionError';
    }
}

/** Reads the extension app's currently granted delegated scopes on a container type. */
export type GrantedScopesReader = () => Promise<readonly ContainerTypeAppPermission[]>;

/** Collect the delegated scopes out of a grant document or a grant collection. */
function readDelegatedPermissions(response: unknown): ContainerTypeAppPermission[] {
    const scopes = new Set<string>();
    const collect = (grant: unknown): void => {
        const delegated = (grant as { delegatedPermissions?: unknown } | null)?.delegatedPermissions;
        if (!Array.isArray(delegated)) { return; }
        for (const scope of delegated) {
            if (typeof scope === 'string') { scopes.add(scope); }
        }
    };
    const value = (response as { value?: unknown } | null)?.value;
    if (Array.isArray(value)) { value.forEach(collect); } else { collect(response); }
    return [...scopes] as ContainerTypeAppPermission[];
}

/**
 * Default grant lookup: reads the container type's application permission grants with the
 * panel's own Graph client.
 *
 * Every `StorageExplorerApi` gets one of these unless the caller injects a better one, so
 * capability gating is never silently disabled by a construction site that omitted the
 * dependency. The extension host injects an app-scoped reader (see `StorageExplorerPanel`);
 * this fallback reads the registration's grant collection, which is the most specific answer
 * available when the caller has not told us which app it is running as.
 *
 * A definite "no grant" (404) yields no scopes and therefore denies. Any other failure
 * propagates, so a Graph outage surfaces as itself rather than as a permanent denial —
 * either way, nothing is authorized.
 */
export function createGraphGrantedScopesReader(
    client: Graph.Client,
    containerTypeId: string,
    appId?: string
): GrantedScopesReader {
    const base = `/storage/fileStorage/containerTypeRegistrations/${containerTypeId}/applicationPermissionGrants`;
    const path = appId ? `${base}/${appId}` : base;
    return async () => {
        try {
            return readDelegatedPermissions(await client.api(path).version('v1.0').get());
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err = error as any;
            if (err?.statusCode === 404 || err?.code === 'itemNotFound') { return []; }
            throw error;
        }
    };
}

/** Per-request facilities handed to an operation handler. */
export interface OperationContext {
    /** Emit an incremental payload while the operation is still running. */
    onProgress: (data: unknown) => void;
}

type OperationHandlers = {
    [K in StorageExplorerOperation]: (
        params: OperationParams<K>,
        context: OperationContext
    ) => Promise<OperationResult<K>>;
};

/** Convert a thrown value into a structured-clone-safe envelope for the webview. */
export function serializeError(error: unknown): SerializedError {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
    const code = typeof err?.code === 'string' ? err.code : undefined;
    const message = typeof err?.message === 'string' && err.message
        ? err.message
        : String(error);
    // Scope *names* only, and only when the host itself denied the call.
    const requiredScopes = Array.isArray(err?.requiredScopes)
        ? (err.requiredScopes as unknown[]).filter((scope): scope is string => typeof scope === 'string')
        : undefined;
    return { message, statusCode, code, requiredScopes };
}

/**
 * Executes Storage Explorer Graph operations on the extension host.
 *
 * One instance is created per open panel and is bound to that panel's container
 * type. The webview can only invoke the operations enumerated in
 * `StorageExplorerOperations`; it never receives a bearer token, and it cannot
 * influence which container type is queried.
 *
 * The Graph client is injected (see `createGraphClient`) so this class has no
 * dependency on `vscode` and can be driven with a stub client in tests.
 */
export class StorageExplorerApi {
    private readonly _containers: ContainerGraphService;
    private readonly _drive: DriveGraphService;
    private readonly _permissions: PermissionGraphService;
    private readonly _columns: ColumnGraphService;
    private readonly _people: PeopleGraphService;
    private readonly _me: MeGraphService;
    private readonly _handlers: OperationHandlers;

    /** Graph `@odata.nextLink` values for this panel. The webview only ever sees opaque ids. */
    private readonly _continuations = new ContinuationStore();

    /**
     * Containers already proven to belong to `_containerTypeId`.
     *
     * Populated from every container listing/creation this panel performs, so the common
     * path costs nothing; ids the webview supplies out of the blue are verified lazily.
     */
    private readonly _containersInScope = new Set<string>();
    private readonly _pendingScopeChecks = new Map<string, Promise<void>>();

    /** Memoized grant lookup; invalidated whenever the host grants new permissions. */
    private _grantedScopes: Promise<readonly ContainerTypeAppPermission[]> | undefined;

    /** Grant lookup backing the capability matrix. Always present, so gating is never skipped. */
    private readonly _readGrantedScopes: GrantedScopesReader;

    /**
     * @param _containerTypeId Container type this panel was opened for. Injected into every
     *   container-type-scoped operation instead of being accepted from the webview.
     * @param client Authenticated Graph client; its token stays in the host process.
     * @param readGrantedScopes Reads the extension app's delegated scopes on this container
     *   type. Optional only so callers need not repeat the default; omitting it falls back to
     *   reading the live grant with `client`, never to skipping the capability check.
     */
    public constructor(
        private readonly _containerTypeId: string,
        client: Graph.Client,
        readGrantedScopes?: GrantedScopesReader
    ) {
        this._readGrantedScopes = readGrantedScopes
            ?? createGraphGrantedScopesReader(client, _containerTypeId);
        this._containers = new ContainerGraphService(client);
        this._drive = new DriveGraphService(client);
        this._permissions = new PermissionGraphService(client);
        this._columns = new ColumnGraphService(client);
        this._people = new PeopleGraphService(client);
        this._me = new MeGraphService(client);
        this._handlers = this._buildHandlers();
    }

    /** Drop the memoized grant so the next authorization check re-reads it. */
    public invalidateGrantedScopes(): void {
        this._grantedScopes = undefined;
    }

    /**
     * Validate and run a single operation requested by the webview.
     * Throws when the operation is unknown or its parameters fail validation.
     */
    public async execute(
        operation: unknown,
        rawParams: unknown,
        context: OperationContext
    ): Promise<unknown> {
        if (!isStorageExplorerOperation(operation)) {
            throw new Error(`Unsupported Storage Explorer operation: ${String(operation)}`);
        }

        const schema = OPERATION_SCHEMAS[operation];
        const params = schema.parse(rawParams ?? {});

        // Authorize before anything else touches Graph: a denied interaction must cost zero
        // requests, so it can never be confused with an empty collection.
        await this._assertAuthorized(operation);

        // Every container-scoped operation names its target with `containerId` or `driveId`
        // (in SPE these are the same value). Confirm the target belongs to this panel's
        // container type before touching Graph, so a compromised webview cannot use the
        // panel as a proxy into containers the user opened elsewhere.
        const scoped = params as { containerId?: unknown; driveId?: unknown };
        if (typeof scoped.containerId === 'string') {
            await this._assertContainerInScope(scoped.containerId);
        }
        if (typeof scoped.driveId === 'string' && scoped.driveId !== scoped.containerId) {
            await this._assertContainerInScope(scoped.driveId);
        }

        const handler = this._handlers[operation] as unknown as (
            p: unknown,
            c: OperationContext
        ) => Promise<unknown>;
        return handler(params, context);
    }

    /**
     * Reject an operation the extension app has no grant for, naming the missing scopes.
     *
     * Gating happens here rather than in each service so no operation can be added without
     * passing through the matrix. Operations that need no container-type capability skip the
     * grant lookup entirely.
     *
     * Fails closed: an empty, absent, or unreadable grant authorizes nothing.
     */
    private async _assertAuthorized(operation: StorageExplorerOperation): Promise<void> {
        const required = missingCapabilitiesForOperation(operation, []);
        if (required.length === 0) { return; }

        if (!this._grantedScopes) {
            const pending = Promise.resolve(this._readGrantedScopes());
            this._grantedScopes = pending;
            // A failed lookup must not be memoized as "nothing granted".
            pending.catch(() => {
                if (this._grantedScopes === pending) { this._grantedScopes = undefined; }
            });
        }

        const granted = await this._grantedScopes;
        const missing = missingCapabilitiesForOperation(operation, granted);
        if (missing.length > 0) {
            throw new MissingContainerTypePermissionError(missing as StorageExplorerCapability[]);
        }
    }

    /** Start (or restart) a first-page listing, retiring the view's earlier continuations. */
    private async _listFirstPage(
        scope: CollectionScope,
        fetch: (onNextLink: NextLinkSink) => Promise<StorageItem[]>
    ): Promise<PagedResult<StorageItem>> {
        const generation = this._continuations.beginListing(scope);
        let nextLink: string | undefined;
        const items = await fetch(link => { nextLink = link; });
        const continuation = this._continuations.issue(scope, nextLink, generation);
        return continuation ? { items, continuation } : { items };
    }

    /**
     * Fetch exactly one further page for a continuation this panel issued.
     *
     * The webview supplies an opaque id plus the view it believes it is in; the host owns the
     * Graph link and rejects a token that belongs to another view or to a superseded listing.
     */
    private async _loadMore(
        token: string,
        claimedScope: CollectionScope
    ): Promise<PagedResult<StorageItem>> {
        const { scope, nextLink, generation } = this._continuations.redeem(token, claimedScope);
        let items: StorageItem[];
        let followingLink: string | undefined;
        try {
            items = await this._fetchNextPage(scope, nextLink, link => { followingLink = link; });
        } catch (error) {
            // The token was consumed on redemption; give it back so a retry resumes from the
            // same page instead of skipping it.
            this._continuations.reinstate(token, { scope, nextLink, generation });
            throw error;
        }
        if (scope.kind === 'containers' || scope.kind === 'deletedContainers') {
            this._trackInScope(items);
        }
        const continuation = this._continuations.issue(scope, followingLink, generation);
        return continuation ? { items, continuation } : { items };
    }

    private _fetchNextPage(
        scope: CollectionScope,
        nextLink: string,
        onNextLink: NextLinkSink
    ): Promise<StorageItem[]> {
        switch (scope.kind) {
            case 'containers': return this._containers.listNextPage(nextLink, onNextLink);
            case 'deletedContainers': return this._containers.listDeletedNextPage(nextLink, onNextLink);
            case 'driveChildren': return this._drive.listChildrenNextPage(nextLink, onNextLink);
            case 'recycleBin': return this._drive.listRecycleBinNextPage(nextLink, onNextLink);
        }
    }

    /** Record containers this panel legitimately surfaced, then pass the value through. */
    private _trackInScope<T extends StorageItem | StorageItem[] | null>(result: T): T {
        if (Array.isArray(result)) {
            for (const item of result) {
                if (item?.id) { this._containersInScope.add(item.id); }
            }
        } else if (result?.id) {
            this._containersInScope.add(result.id);
        }
        return result;
    }

    /** Throw unless `containerId` belongs to the container type this panel is bound to. */
    private async _assertContainerInScope(containerId: string): Promise<void> {
        if (this._containersInScope.has(containerId)) { return; }

        let pending = this._pendingScopeChecks.get(containerId);
        if (!pending) {
            pending = this._verifyContainerScope(containerId);
            this._pendingScopeChecks.set(containerId, pending);
            // Clear the cache entry either way; a rejected check must not be memoized.
            const clear = (): void => { this._pendingScopeChecks.delete(containerId); };
            pending.then(clear, clear);
        }
        await pending;
    }

    private async _verifyContainerScope(containerId: string): Promise<void> {
        const container = await this._containers.get(containerId);
        if (!container || container.containerTypeId !== this._containerTypeId) {
            throw new Error(
                `Container ${containerId} is not part of container type ${this._containerTypeId}.`
            );
        }
        this._containersInScope.add(containerId);
    }

    /* eslint-disable @typescript-eslint/naming-convention -- keys are dotted operation ids, not identifiers */
    private _buildHandlers(): OperationHandlers {
        const containers = this._containers;
        const drive = this._drive;
        const permissions = this._permissions;
        const columns = this._columns;
        const people = this._people;
        const me = this._me;

        return {
            // ── containers ────────────────────────────────────────────────────
            'containers.list': async () => this._listFirstPage(
                { kind: 'containers' },
                async onNextLink =>
                    this._trackInScope(await containers.list(this._containerTypeId, onNextLink))
            ),
            'containers.get': p => containers.get(p.containerId),
            'containers.create': async p =>
                this._trackInScope(await containers.create(this._containerTypeId, p.displayName, p.description)),
            'containers.activate': p => containers.activate(p.containerId),
            'containers.rename': p => containers.rename(p.containerId, p.displayName),
            'containers.updateDescription': p => containers.updateDescription(p.containerId, p.description),
            'containers.delete': p => containers.delete(p.containerId),
            'containers.listDeleted': async () => this._listFirstPage(
                { kind: 'deletedContainers' },
                async onNextLink =>
                    this._trackInScope(await containers.listDeleted(this._containerTypeId, onNextLink))
            ),
            'containers.restore': p => containers.restore(p.containerId),
            'containers.permanentlyDelete': p => containers.permanentlyDelete(p.containerId),
            'containers.getSettings': p => containers.getSettings(p.containerId),
            'containers.updateSettings': p =>
                containers.updateSettings(p.containerId, p.settings as Partial<FileStorageContainerSettings>),
            'containers.getCustomProperties': p => containers.getCustomProperties(p.containerId),
            'containers.setCustomProperty': p =>
                containers.setCustomProperty(p.containerId, p.key, p.value, p.isSearchable),
            'containers.deleteCustomProperty': p => containers.deleteCustomProperty(p.containerId, p.key),

            // ── collections ───────────────────────────────────────────────────
            'collections.loadMore': p => this._loadMore(p.continuation, p.scope as CollectionScope),

            // ── drive ─────────────────────────────────────────────────────────
            'drive.listChildren': p => this._listFirstPage(
                { kind: 'driveChildren', containerId: p.driveId, itemId: p.itemId },
                onNextLink => drive.listChildren(p.driveId, p.itemId, undefined, onNextLink)
            ),
            'drive.get': p => drive.get(p.driveId, p.itemId),
            'drive.getDetailedDriveItem': p => drive.getDetailedDriveItem(p.driveId, p.itemId),
            'drive.createFolder': p => drive.createFolder(p.driveId, p.parentId, p.name),
            'drive.createFile': p => drive.createFile(p.driveId, p.parentId, p.name),
            'drive.rename': p => drive.rename(p.driveId, p.itemId, p.newName),
            'drive.delete': p => drive.delete(p.driveId, p.itemId),
            'drive.uploadSmall': p =>
                drive.uploadSmall(p.driveId, p.parentId, p.fileName, p.contentType, p.bytes),
            'drive.createUploadSession': p => drive.createUploadSession(p.driveId, p.parentId, p.fileName),
            'drive.listRecycleBin': p => this._listFirstPage(
                { kind: 'recycleBin', containerId: p.containerId },
                onNextLink => drive.listRecycleBin(p.containerId, onNextLink)
            ),
            'drive.restoreFromRecycleBin': p => drive.restoreFromRecycleBin(p.containerId, p.itemId),
            'drive.permanentlyDelete': p => drive.permanentlyDelete(p.containerId, p.itemId),
            'drive.getFields': p => drive.getFields(p.driveId, p.itemId),
            'drive.updateFields': p => drive.updateFields(p.driveId, p.itemId, p.fields),
            'drive.listVersions': p => drive.listVersions(p.driveId, p.itemId),
            'drive.getVersionDownloadUrl': p =>
                drive.getVersionDownloadUrl(p.driveId, p.itemId, p.versionId),
            'drive.restoreVersion': p => drive.restoreVersion(p.driveId, p.itemId, p.versionId),
            'drive.deleteVersion': p => drive.deleteVersion(p.driveId, p.itemId, p.versionId),
            'drive.getItemWebUrl': p => drive.getItemWebUrl(p.driveId, p.itemId),
            'drive.getDownloadUrl': p => drive.getDownloadUrl(p.driveId, p.itemId),
            'drive.getPreviewUrl': p => drive.getPreviewUrl(p.driveId, p.itemId),

            // ── permissions ───────────────────────────────────────────────────
            'permissions.listItemPermissions': p => permissions.listItemPermissions(p.driveId, p.itemId),
            'permissions.createSharingLink': p =>
                permissions.createSharingLink(
                    p.driveId, p.itemId, p.type, p.scope, p.expirationDate, p.preventDownload
                ),
            'permissions.inviteToItem': p =>
                permissions.inviteToItem(
                    p.driveId, p.itemId, p.emails, p.role, p.requireSignIn, p.sendInvitation, p.expirationDate
                ),
            'permissions.updateItemPermission': p =>
                permissions.updateItemPermission(
                    p.driveId, p.itemId, p.permissionId, p.patch as Partial<Permission>
                ),
            'permissions.deleteItemPermission': p =>
                permissions.deleteItemPermission(p.driveId, p.itemId, p.permissionId),
            'permissions.listContainerPermissions': p => permissions.listContainerPermissions(p.containerId),
            'permissions.addContainerPermission': p =>
                permissions.addContainerPermission(p.containerId, p.member, p.role),
            'permissions.updateContainerPermission': p =>
                permissions.updateContainerPermission(p.containerId, p.permissionId, p.role),
            'permissions.deleteContainerPermission': p =>
                permissions.deleteContainerPermission(p.containerId, p.permissionId),

            // ── columns ───────────────────────────────────────────────────────
            'columns.listContainerColumns': p => columns.listContainerColumns(p.containerId),
            'columns.createContainerColumn': p =>
                columns.createContainerColumn(p.containerId, p.column as Partial<ColumnDefinition>),
            'columns.updateContainerColumn': p =>
                columns.updateContainerColumn(p.containerId, p.columnId, p.column as Partial<ColumnDefinition>),
            'columns.deleteContainerColumn': p => columns.deleteContainerColumn(p.containerId, p.columnId),
            'columns.getItemFields': p => columns.getItemFields(p.driveId, p.itemId),
            'columns.updateItemFields': p => columns.updateItemFields(p.driveId, p.itemId, p.fields),

            // ── people ────────────────────────────────────────────────────────
            'people.searchUsers': p => people.searchUsers(p.query),
            'people.searchGroups': p => people.searchGroups(p.query),
            'people.search': p => people.search(p.query),

            // ── me ────────────────────────────────────────────────────────────
            'me.get': () => me.get(),
        };
    }
    /* eslint-enable @typescript-eslint/naming-convention */
}
