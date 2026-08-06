/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import type { DriveItem } from '@microsoft/microsoft-graph-types';
import { DriveItemDetails, DriveItemVersion, StorageItem } from './protocol';
import { driveItemToStorageItem, RecycleBinItem, recycleBinItemToStorageItem } from './mappers';

const SELECT =
    'id,name,file,folder,size,lastModifiedDateTime,createdDateTime,webUrl,@microsoft.graph.downloadUrl';
// List select deliberately OMITS `@microsoft.graph.downloadUrl`: it's an expensive per-item
// computed property that makes Graph shrink the page size, and it's fetched lazily on download
// (see getDownloadUrl). Keeping it out lets listing pages come back full-size and fast.
const LIST_SELECT = 'id,name,file,folder,size,lastModifiedDateTime,createdDateTime,webUrl';

/**
 * Wrap raw bytes in a payload the Graph SDK will pass through untouched.
 *
 * The SDK's `serializeContent` only recognises `Buffer`, `Blob`, `File`, `FormData`,
 * `ArrayBuffer`, and strings — a bare `Uint8Array` would be JSON-stringified. `Buffer`
 * is used on the extension host; the `Blob` fallback keeps this module runnable in a
 * browser (the standalone webview test harness) where `Buffer` does not exist.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBinaryBody(bytes: Uint8Array): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (typeof g.Buffer !== 'undefined') {
        return g.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    return new g.Blob([bytes]);
}

/**
 * Drive item operations for the Storage Explorer, executed on the extension host.
 *
 * Chunked-upload traffic is intentionally NOT handled here: `createUploadSession`
 * returns a pre-authenticated session URL that carries no `Authorization` header,
 * so the webview PUTs the chunks itself without ever holding a bearer token.
 */
export class DriveGraphService {
    /** Upper bound for single-PUT uploads. Files above this use the session API. */
    public static readonly SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MiB

    public constructor(private readonly _client: Graph.Client) { }

    /**
     * List the children of a drive root (itemId undefined) or a specific folder.
     * driveId is the container ID (container.id === driveId).
     *
     * `onPage` is invoked once per page with **only that page's items** so callers can
     * stream rows to the UI incrementally; sending the cumulative array each time makes
     * streaming a large folder quadratic in both mapping cost and message size.
     */
    public async listChildren(
        driveId: string,
        itemId?: string,
        onPage?: (page: StorageItem[]) => void
    ): Promise<StorageItem[]> {
        const firstPath = itemId
            ? `/drives/${driveId}/items/${itemId}/children`
            : `/drives/${driveId}/root/children`;

        // Follow @odata.nextLink to load EVERY page — a folder can hold far more items than a
        // single Graph page (~200). The first request applies select+top; subsequent requests
        // use the server-provided nextLink, which already encodes the query.
        const all: StorageItem[] = [];
        const emit = (items?: DriveItem[]): void => {
            const page = (items ?? []).map(driveItemToStorageItem);
            for (const item of page) { all.push(item); }
            onPage?.(page);
        };

        // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
        let resp: { value?: DriveItem[]; '@odata.nextLink'?: string } =
            await this._client.api(firstPath).select(LIST_SELECT).top(200).get();
        emit(resp.value);

        let nextLink = resp['@odata.nextLink'];
        let guard = 0;
        while (nextLink && guard < 1000) {
            resp = await this._client.api(nextLink).get();
            emit(resp.value);
            nextLink = resp['@odata.nextLink'];
            guard++;
        }

        return all;
    }

    /** Get a single drive item by ID. */
    public async get(driveId: string, itemId: string): Promise<StorageItem | null> {
        const item: DriveItem = await this._client
            .api(`/drives/${driveId}/items/${itemId}`)
            .select(SELECT)
            .get();
        return item ? driveItemToStorageItem(item) : null;
    }

    /**
     * Fetch rich details for a single drive item used by the properties panel.
     * Includes facets (publication, malware, audio, image, photo, video),
     * SharePoint IDs, WebDAV URL, parent reference, and optionally the
     * retention label (fetched in a separate call so errors don't block).
     */
    public async getDetailedDriveItem(driveId: string, itemId: string): Promise<DriveItemDetails> {
        const detailSelect = [
            'id', 'name', 'file', 'folder', 'size',
            'lastModifiedDateTime', 'createdDateTime',
            'webUrl', 'webDavUrl', 'parentReference',
            'sharepointIds', 'publication', 'malware',
            'audio', 'image', 'photo', 'video',
            '@microsoft.graph.downloadUrl',
        ].join(',');
        const raw = await this._client
            .api(`/drives/${driveId}/items/${itemId}`)
            .select(detailSelect)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .get() as any;

        // Retention label is a navigation property — fetch separately so
        // a 404 (no label) or unsupported error doesn't break the whole call.
        let retentionLabel: DriveItemDetails['retentionLabel'] = null;
        try {
            retentionLabel = await this._client
                .api(`/drives/${driveId}/items/${itemId}/retentionLabel`)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .get() as any;
        } catch {
            // no label or endpoint not available — leave null
        }

        return {
            id: raw.id ?? '',
            name: raw.name ?? '',
            isFolder: !!raw.folder,
            size: raw.size,
            createdDateTime: raw.createdDateTime,
            lastModifiedDateTime: raw.lastModifiedDateTime,
            webUrl: raw.webUrl,
            webDavUrl: raw.webDavUrl,
            downloadUrl: raw['@microsoft.graph.downloadUrl'],
            mimeType: raw.file?.mimeType,
            childCount: raw.folder?.childCount,
            parentId: raw.parentReference?.id,
            sharepointIds: raw.sharepointIds,
            publication: raw.publication,
            malware: raw.malware,
            retentionLabel,
            audio: raw.audio,
            image: raw.image,
            photo: raw.photo,
            video: raw.video,
        };
    }

    /**
     * Create a new folder.
     * parentId null → create under drive root.
     */
    public async createFolder(driveId: string, parentId: string | null, name: string): Promise<StorageItem> {
        const path = parentId
            ? `/drives/${driveId}/items/${parentId}/children`
            : `/drives/${driveId}/root/children`;
        const created: DriveItem = await this._client.api(path).post({
            name,
            folder: {},
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
            '@microsoft.graph.conflictBehavior': 'rename',
        });
        return driveItemToStorageItem(created);
    }

    /**
     * Create a new empty file (any type, including Office documents).
     * SharePoint initialises Office files from their templates on first open.
     * parentId null → create under drive root.
     */
    public async createFile(driveId: string, parentId: string | null, name: string): Promise<StorageItem> {
        const path = parentId
            ? `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(name)}:/content`
            : `/drives/${driveId}/root:/${encodeURIComponent(name)}:/content`;
        const created: DriveItem = await this._client
            .api(path)
            .header('Content-Type', 'application/octet-stream')
            .put(toBinaryBody(new Uint8Array(0)));
        return driveItemToStorageItem(created);
    }

    /** Rename a drive item. */
    public async rename(driveId: string, itemId: string, newName: string): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}`)
            .patch({ name: newName });
    }

    /** Move a drive item to the recycle bin. */
    public async delete(driveId: string, itemId: string): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}`)
            .delete();
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    /** Upload a file <= SMALL_FILE_THRESHOLD in a single PUT request. */
    public async uploadSmall(
        driveId: string,
        parentId: string | null,
        fileName: string,
        contentType: string,
        bytes: Uint8Array
    ): Promise<StorageItem> {
        const path = parentId
            ? `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/content`
            : `/drives/${driveId}/root:/${encodeURIComponent(fileName)}:/content`;
        const created: DriveItem = await this._client
            .api(path)
            .header('Content-Type', contentType || 'application/octet-stream')
            .put(toBinaryBody(bytes));
        return driveItemToStorageItem(created);
    }

    /**
     * Create a session for uploading a large file.
     * Returns the pre-authenticated uploadUrl (valid for ~24 hours). The URL requires
     * no `Authorization` header, so the caller can PUT chunks without a bearer token.
     */
    public async createUploadSession(
        driveId: string,
        parentId: string | null,
        fileName: string
    ): Promise<string> {
        const path = parentId
            ? `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/createUploadSession`
            : `/drives/${driveId}/root:/${encodeURIComponent(fileName)}:/createUploadSession`;
        const resp = await this._client.api(path).post({
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
            item: { '@microsoft.graph.conflictBehavior': 'rename' },
        });
        const uploadUrl: string = resp?.uploadUrl ?? '';
        if (!uploadUrl) {
            throw new Error('createUploadSession: no uploadUrl in response.');
        }
        return uploadUrl;
    }

    // ── Recycle bin ───────────────────────────────────────────────────────────

    /** List items in the drive's recycle bin using the SPE-specific recycleBin API. */
    public async listRecycleBin(containerId: string): Promise<StorageItem[]> {
        const resp = await this._client
            .api(`/storage/fileStorage/containers/${containerId}/recycleBin/items`)
            .get();
        const items: RecycleBinItem[] = resp.value ?? [];
        return items.map(recycleBinItemToStorageItem);
    }

    /** Restore an item from the SPE container recycle bin. Uses beta endpoint. */
    public async restoreFromRecycleBin(containerId: string, itemId: string): Promise<void> {
        await this._client
            .api(`https://graph.microsoft.com/beta/storage/fileStorage/containers/${containerId}/recycleBin/items/restore`)
            .post({ ids: [itemId] });
    }

    /** Permanently delete an item from the SPE container recycle bin. Uses beta endpoint. */
    public async permanentlyDelete(containerId: string, itemId: string): Promise<void> {
        await this._client
            .api(`https://graph.microsoft.com/beta/storage/fileStorage/containers/${containerId}/recycleBin/items/delete`)
            .post({ ids: [itemId] });
    }

    // ── List item fields ──────────────────────────────────────────────────────

    /** Get the listItem fields (custom metadata) for a drive item. */
    public async getFields(driveId: string, itemId: string): Promise<Record<string, unknown>> {
        return this._client
            .api(`/drives/${driveId}/items/${itemId}/listItem/fields`)
            .get();
    }

    /** Update the listItem fields (custom metadata) for a drive item. */
    public async updateFields(
        driveId: string,
        itemId: string,
        fields: Record<string, unknown>
    ): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}/listItem/fields`)
            .patch(fields);
    }

    // ── Versions ──────────────────────────────────────────────────────────────

    /** List version history for a drive item. */
    public async listVersions(driveId: string, itemId: string): Promise<DriveItemVersion[]> {
        const resp = await this._client
            .api(`/drives/${driveId}/items/${itemId}/versions`)
            .get();
        return resp.value ?? [];
    }

    /** Get a pre-authenticated download URL for a specific version. */
    public async getVersionDownloadUrl(driveId: string, itemId: string, versionId: string): Promise<string> {
        const raw = await this._client
            .api(`/drives/${driveId}/items/${itemId}/versions/${versionId}`)
            .select('@microsoft.graph.downloadUrl')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .get() as any;
        const url: string = raw?.['@microsoft.graph.downloadUrl'] ?? '';
        if (!url) {
            throw new Error('Download URL not available for this version.');
        }
        return url;
    }

    /** Restore a prior version, making it the current version. */
    public async restoreVersion(driveId: string, itemId: string, versionId: string): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}/versions/${versionId}/restoreVersion`)
            .post({});
    }

    /** Permanently delete a specific version of a drive item. */
    public async deleteVersion(driveId: string, itemId: string, versionId: string): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}/versions/${versionId}`)
            .delete();
    }

    // ── URLs ──────────────────────────────────────────────────────────────────

    /**
     * Return the `webUrl` of the drive root or a specific folder item.
     * Used to build Office desktop URI schemes (ms-word:ofe|u|{folderUrl}/{fileName}).
     */
    public async getItemWebUrl(driveId: string, itemId?: string): Promise<string> {
        const path = itemId
            ? `/drives/${driveId}/items/${itemId}`
            : `/drives/${driveId}/root`;
        const item = await this._client.api(path).select('webUrl').get();
        const url: string = item?.webUrl ?? '';
        if (!url) {
            throw new Error('webUrl not available for this item.');
        }
        return url;
    }

    /**
     * Fetch a pre-authenticated download URL for a drive item.
     * Graph returns the `@microsoft.graph.downloadUrl` annotation reliably when
     * fetching a single item, even for Office files where it may be absent from
     * listing responses.
     */
    public async getDownloadUrl(driveId: string, itemId: string): Promise<string> {
        const raw = await this._client
            .api(`/drives/${driveId}/items/${itemId}`)
            .select('@microsoft.graph.downloadUrl')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .get() as any;
        const url: string = raw?.['@microsoft.graph.downloadUrl'] ?? '';
        if (!url) {
            throw new Error('Download URL not available for this file.');
        }
        return url;
    }

    /**
     * Fetch an embeddable preview URL for a drive item.
     * POSTs to /driveItem/preview and returns getUrl with ?nb=true appended
     * to suppress the OneDrive banner in SPE.
     */
    public async getPreviewUrl(driveId: string, itemId: string): Promise<string> {
        const resp = await this._client
            .api(`/drives/${driveId}/items/${itemId}/preview`)
            .post({});
        const getUrl: string = resp?.getUrl ?? '';
        if (!getUrl) {
            throw new Error('No preview URL returned from API.');
        }
        const separator = getUrl.indexOf('?') !== -1 ? '&' : '?';
        return `${getUrl}${separator}nb=true`;
    }
}
