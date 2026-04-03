import { Client } from '@microsoft/microsoft-graph-client';
import type { DriveItem } from '@microsoft/microsoft-graph-types';
import { StorageItem, NetworkRequest } from '../../models/StorageItem';
import { WebviewAuthProvider } from '../WebviewAuthProvider';
import { withAuthRetry } from '../GraphClient';
import { NetworkLogger } from '../NetworkLoggingMiddleware';

const SELECT = 'id,name,file,folder,size,lastModifiedDateTime,createdDateTime,webUrl,@microsoft.graph.downloadUrl';

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

function getFileType(item: DriveItem): string {
    if (item.folder) return 'Folder';
    const name = item.name ?? '';
    const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : null;
    if (!ext) return 'File';
    const typeMap: Record<string, string> = {
        DOCX: 'Word Document', DOC: 'Word Document',
        XLSX: 'Excel Workbook', XLS: 'Excel Workbook',
        PPTX: 'PowerPoint Presentation', PPT: 'PowerPoint Presentation',
        PDF: 'PDF Document',
        PNG: 'PNG Image', JPG: 'JPEG Image', JPEG: 'JPEG Image', GIF: 'GIF Image', WEBP: 'WebP Image',
        TXT: 'Text Document', CSV: 'CSV File',
        ZIP: 'ZIP Archive', RAR: 'RAR Archive',
        MP4: 'MP4 Video', MOV: 'MOV Video', MP3: 'MP3 Audio',
    };
    return typeMap[ext] ?? `${ext} File`;
}

function toStorageItem(item: DriveItem): StorageItem {
    const raw = item as any;
    return {
        id: item.id ?? '',
        name: item.name ?? '(unnamed)',
        kind: item.folder ? 'folder' : 'file',
        modifiedAt: formatDate(item.lastModifiedDateTime),
        createdAt: formatDate(item.createdDateTime),
        type: getFileType(item),
        size: formatBytes(item.size),
        mimeType: item.file?.mimeType ?? undefined,
        webUrl: item.webUrl ?? undefined,
        downloadUrl: raw['@microsoft.graph.downloadUrl'] ?? undefined,
    };
}

// ── SPE recycleBin item ───────────────────────────────────────────────────────

interface RecycleBinItem {
    id?: string;
    name?: string;
    size?: number;
    deletedDateTime?: string;
    deletedFromLocation?: string;
}

function toRecycledStorageItem(item: RecycleBinItem): StorageItem {
    const name = item.name ?? '(unnamed)';
    // Infer kind from extension: items with no extension (or a very long one) are treated as folders.
    const dotIdx = name.lastIndexOf('.');
    const hasExt = dotIdx > 0 && (name.length - dotIdx - 1) <= 6;
    const kind = hasExt ? 'file' : 'folder';
    return {
        id: item.id ?? '',
        name,
        kind,
        modifiedAt: formatDate(item.deletedDateTime),
        deletedAt: formatDate(item.deletedDateTime),
        createdAt: '',
        type: kind === 'folder' ? 'Folder' : getFileType({ name, folder: undefined } as any),
        size: formatBytes(item.size),
    };
}

// ── Rich details for the file properties panel ───────────────────────────────

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
    retentionLabel?: { name?: string; [key: string]: any } | null;
    audio?: Record<string, any>;
    image?: Record<string, any>;
    photo?: Record<string, any>;
    video?: Record<string, any>;
}

// ── Version shape returned by Graph ──────────────────────────────────────────

export interface DriveItemVersion {
    id?: string;
    size?: number;
    lastModifiedDateTime?: string;
    lastModifiedBy?: { user?: { displayName?: string; email?: string } };
    published?: { level?: string; versionId?: string };
    '@microsoft.graph.downloadUrl'?: string;
}

export class DriveGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
        private readonly _onNetworkRequest?: NetworkLogger,
    ) {}

    /**
     * List the children of a drive root (itemId undefined) or a specific folder.
     * driveId is the container ID (container.id === driveId).
     */
    async listChildren(driveId: string, itemId?: string): Promise<StorageItem[]> {
        return withAuthRetry(this._authProvider, async () => {
            const path = itemId
                ? `/drives/${driveId}/items/${itemId}/children`
                : `/drives/${driveId}/root/children`;
            const resp = await this._client.api(path).select(SELECT).top(200).get();
            const items: DriveItem[] = resp.value ?? [];
            return items.map(toStorageItem);
        });
    }

    /** Get a single drive item by ID. */
    async get(driveId: string, itemId: string): Promise<StorageItem | null> {
        return withAuthRetry(this._authProvider, async () => {
            const item: DriveItem = await this._client
                .api(`/drives/${driveId}/items/${itemId}`)
                .select(SELECT)
                .get();
            return item ? toStorageItem(item) : null;
        });
    }

    /**
     * Fetch rich details for a single drive item used by the properties panel.
     * Includes facets (publication, malware, audio, image, photo, video),
     * SharePoint IDs, WebDAV URL, parent reference, and optionally the
     * retention label (fetched in a separate call so errors don't block).
     */
    async getDetailedDriveItem(driveId: string, itemId: string): Promise<DriveItemDetails> {
        return withAuthRetry(this._authProvider, async () => {
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
                .get() as any;

            // Retention label is a navigation property — fetch separately so
            // a 404 (no label) or unsupported error doesn't break the whole call.
            let retentionLabel: DriveItemDetails['retentionLabel'] = null;
            try {
                retentionLabel = await this._client
                    .api(`/drives/${driveId}/items/${itemId}/retentionLabel`)
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
        });
    }

    /**
     * Create a new folder.
     * parentId null → create under drive root.
     */
    async createFolder(driveId: string, parentId: string | null, name: string): Promise<StorageItem> {
        return withAuthRetry(this._authProvider, async () => {
            const path = parentId
                ? `/drives/${driveId}/items/${parentId}/children`
                : `/drives/${driveId}/root/children`;
            const created: DriveItem = await this._client.api(path).post({
                name,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename',
            });
            return toStorageItem(created);
        });
    }

    /**
     * Create a new empty file (any type, including Office documents).
     * SharePoint initialises Office files from their templates on first open.
     * parentId null → create under drive root.
     */
    async createFile(driveId: string, parentId: string | null, name: string): Promise<StorageItem> {
        return withAuthRetry(this._authProvider, async () => {
            const path = parentId
                ? `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(name)}:/content`
                : `/drives/${driveId}/root:/${encodeURIComponent(name)}:/content`;
            const created: DriveItem = await this._client
                .api(path)
                .header('Content-Type', 'application/octet-stream')
                .put(new Blob([], { type: 'application/octet-stream' }));
            return toStorageItem(created);
        });
    }

    /** Rename a drive item. */
    async rename(driveId: string, itemId: string, newName: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/drives/${driveId}/items/${itemId}`)
                .patch({ name: newName });
        });
    }

    /** Move a drive item to the recycle bin. */
    async delete(driveId: string, itemId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/drives/${driveId}/items/${itemId}`)
                .delete();
        });
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    /** Upper bound for single-PUT uploads. Files above this use the session API. */
    static readonly SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MiB
    /** Chunk size for session-based uploads.
     * Must be a multiple of 320 KiB (327,680 bytes).
     * 18 × 320 KiB = 5,898,240 bytes ≈ 5.625 MiB
     */
    static readonly CHUNK_SIZE = 18 * 320 * 1024; // 5,898,240 bytes

    /** Upload a file ≤ SMALL_FILE_THRESHOLD in a single PUT request. */
    async uploadSmall(driveId: string, parentId: string | null, file: File): Promise<StorageItem> {
        return withAuthRetry(this._authProvider, async () => {
            const path = parentId
                ? `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(file.name)}:/content`
                : `/drives/${driveId}/root:/${encodeURIComponent(file.name)}:/content`;
            const created: DriveItem = await this._client
                .api(path)
                .header('Content-Type', file.type || 'application/octet-stream')
                .put(file);
            return toStorageItem(created);
        });
    }

    /**
     * Create a session for uploading a large file.
     * Returns the pre-authenticated uploadUrl (valid for ~24 hours).
     */
    async createUploadSession(driveId: string, parentId: string | null, fileName: string): Promise<string> {
        return withAuthRetry(this._authProvider, async () => {
            const path = parentId
                ? `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/createUploadSession`
                : `/drives/${driveId}/root:/${encodeURIComponent(fileName)}:/createUploadSession`;
            const resp = await this._client.api(path).post({
                item: { '@microsoft.graph.conflictBehavior': 'rename' },
            });
            const uploadUrl: string = resp?.uploadUrl ?? '';
            if (!uploadUrl) throw new Error('createUploadSession: no uploadUrl in response.');
            return uploadUrl;
        });
    }

    /**
     * PUT one chunk of a large file to the session uploadUrl.
     * IMPORTANT: The session URL is pre-authenticated — no Authorization header must be sent.
     * We use raw fetch() for this reason, and log the request via _onNetworkRequest.
     * Returns done=true + the completed StorageItem when the last chunk is accepted.
     */
    async uploadChunk(
        uploadUrl: string,
        file: File,
        offset: number,
    ): Promise<{ done: boolean; nextOffset: number; item?: StorageItem }> {
        const end = Math.min(offset + DriveGraphService.CHUNK_SIZE, file.size) - 1;
        const chunkSize = end - offset + 1;
        const chunk = file.slice(offset, end + 1);
        const requestHeaders: Record<string, string> = {
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${offset}-${end}/${file.size}`,
        };
        const start = Date.now();
        let resp: Response;
        try {
            resp = await fetch(uploadUrl, { method: 'PUT', headers: requestHeaders, body: chunk });
        } catch (err: any) {
            this._onNetworkRequest?.({
                id: `chunk-${Date.now()}`,
                method: 'PUT',
                url: uploadUrl,
                status: 0,
                statusText: 'Network Error',
                durationMs: Date.now() - start,
                timestamp: new Date(start).toISOString(),
                requestHeaders,
                error: err?.message ?? 'fetch failed',
                responseHeaders: {},
            });
            throw err;
        }
        const durationMs = Date.now() - start;
        const responseText = await resp.clone().text().catch(() => '');
        this._onNetworkRequest?.({
            id: `chunk-${Date.now()}`,
            method: 'PUT',
            url: uploadUrl,
            status: resp.status,
            statusText: resp.statusText,
            durationMs,
            timestamp: new Date(start).toISOString(),
            requestHeaders,
            requestBody: `[${chunkSize} bytes, offset ${offset}–${end}]`,
            responseHeaders: Object.fromEntries([...resp.headers.entries()].filter(([k]) => k.toLowerCase() !== 'authorization')),
            responseBody: responseText.length > 500 ? responseText.slice(0, 500) + '…' : responseText,
        });
        if (resp.status === 200 || resp.status === 201) {
            const body = JSON.parse(responseText || 'null');
            return { done: true, nextOffset: file.size, item: toStorageItem(body as DriveItem) };
        }
        if (resp.status === 202) {
            const body = JSON.parse(responseText || 'null');
            const ranges: string[] = body?.nextExpectedRanges ?? [];
            const nextOffset = ranges.length > 0 ? parseInt(ranges[0].split('-')[0], 10) : end + 1;
            return { done: false, nextOffset };
        }
        throw new Error(`Chunk upload failed (${resp.status}): ${responseText}`);
    }

    /** DELETE an upload session to abort / clean up a large-file upload. */
    async cancelUploadSession(uploadUrl: string): Promise<void> {
        try { await fetch(uploadUrl, { method: 'DELETE' }); } catch { /* ignore cleanup errors */ }
    }

    /** List items in the drive's recycle bin using the SPE-specific recycleBin API. */
    async listRecycleBin(containerId: string): Promise<StorageItem[]> {
        return withAuthRetry(this._authProvider, async () => {
            const resp = await this._client
                .api(`/storage/fileStorage/containers/${containerId}/recycleBin/items`)
                .get();
            const items: RecycleBinItem[] = resp.value ?? [];
            return items.map(toRecycledStorageItem);
        });
    }

    /** Restore an item from the SPE container recycle bin. Uses beta endpoint. */
    async restoreFromRecycleBin(containerId: string, itemId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`https://graph.microsoft.com/beta/storage/fileStorage/containers/${containerId}/recycleBin/items/restore`)
                .post({ ids: [itemId] });
        });
    }

    /** Permanently delete an item from the SPE container recycle bin. Uses beta endpoint. */
    async permanentlyDelete(containerId: string, itemId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`https://graph.microsoft.com/beta/storage/fileStorage/containers/${containerId}/recycleBin/items/delete`)
                .post({ ids: [itemId] });
        });
    }

    /** Get the listItem fields (custom metadata) for a drive item. */
    async getFields(driveId: string, itemId: string): Promise<Record<string, unknown>> {
        return withAuthRetry(this._authProvider, async () => {
            return this._client
                .api(`/drives/${driveId}/items/${itemId}/listItem/fields`)
                .get();
        });
    }

    /** Update the listItem fields (custom metadata) for a drive item. */
    async updateFields(driveId: string, itemId: string, fields: Record<string, unknown>): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/drives/${driveId}/items/${itemId}/listItem/fields`)
                .patch(fields);
        });
    }

    /** List version history for a drive item. */
    async listVersions(driveId: string, itemId: string): Promise<DriveItemVersion[]> {
        return withAuthRetry(this._authProvider, async () => {
            const resp = await this._client
                .api(`/drives/${driveId}/items/${itemId}/versions`)
                .get();
            return resp.value ?? [];
        });
    }

    /** Get a pre-authenticated download URL for a specific version. */
    async getVersionDownloadUrl(driveId: string, itemId: string, versionId: string): Promise<string> {
        return withAuthRetry(this._authProvider, async () => {
            const raw = await this._client
                .api(`/drives/${driveId}/items/${itemId}/versions/${versionId}`)
                .select('@microsoft.graph.downloadUrl')
                .get() as any;
            const url: string = raw?.['@microsoft.graph.downloadUrl'] ?? '';
            if (!url) throw new Error('Download URL not available for this version.');
            return url;
        });
    }

    /** Restore a prior version, making it the current version. */
    async restoreVersion(driveId: string, itemId: string, versionId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/drives/${driveId}/items/${itemId}/versions/${versionId}/restoreVersion`)
                .post({});
        });
    }

    /** Permanently delete a specific version of a drive item. */
    async deleteVersion(driveId: string, itemId: string, versionId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/drives/${driveId}/items/${itemId}/versions/${versionId}`)
                .delete();
        });
    }

    /**
     * Return the `webUrl` of the drive root or a specific folder item.
     * Used to build Office desktop URI schemes (ms-word:ofe|u|{folderUrl}/{fileName}).
     */
    async getItemWebUrl(driveId: string, itemId?: string): Promise<string> {
        return withAuthRetry(this._authProvider, async () => {
            const path = itemId
                ? `/drives/${driveId}/items/${itemId}`
                : `/drives/${driveId}/root`;
            const item = await this._client.api(path).select('webUrl').get();
            const url: string = item?.webUrl ?? '';
            if (!url) throw new Error('webUrl not available for this item.');
            return url;
        });
    }

    /**
     * Fetch a pre-authenticated download URL for a drive item.
     * Graph returns the `@microsoft.graph.downloadUrl` annotation reliably when
     * fetching a single item, even for Office files where it may be absent from
     * listing responses.
     */
    async getDownloadUrl(driveId: string, itemId: string): Promise<string> {
        return withAuthRetry(this._authProvider, async () => {
            const raw = await this._client
                .api(`/drives/${driveId}/items/${itemId}`)
                .select('@microsoft.graph.downloadUrl')
                .get() as any;
            const url: string = raw?.['@microsoft.graph.downloadUrl'] ?? '';
            if (!url) throw new Error('Download URL not available for this file.');
            return url;
        });
    }

    /**
     * Fetch an embeddable preview URL for a drive item.
     * POSTs to /driveItem/preview and returns getUrl with ?nb=true appended
     * to suppress the OneDrive banner in SPE.
     */
    async getPreviewUrl(driveId: string, itemId: string): Promise<string> {
        return withAuthRetry(this._authProvider, async () => {
            const resp = await this._client
                .api(`/drives/${driveId}/items/${itemId}/preview`)
                .post({});
            const getUrl: string = resp?.getUrl ?? '';
            if (!getUrl) throw new Error('No preview URL returned from API.');
            const separator = getUrl.includes('?') ? '&' : '?';
            return `${getUrl}${separator}nb=true`;
        });
    }
}
