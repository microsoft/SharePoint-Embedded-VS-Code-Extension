import { request } from '../rpc';
import type { NetworkLogger, NetworkRequest, StorageItem, UploadChunkResult } from '../protocol';
import { redactNetworkRequest } from '../../../../src/services/StorageExplorer/networkRedaction';

// Re-exported for the panels that consume these shapes (FilePropertiesPanel, VersionsPanel).
export type { DriveItemDetails, DriveItemVersion } from '../protocol';

/**
 * Drive item operations.
 *
 * Graph calls are executed by the extension host so the webview never holds a
 * bearer token. The one exception is chunked upload traffic: `createUploadSession`
 * returns a *pre-authenticated* `*.sharepoint.com` URL that takes no `Authorization`
 * header, so those PUTs are issued here without any credential.
 */
export class DriveGraphService {
    /** Upper bound for single-PUT uploads. Files above this use the session API. */
    static readonly SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MiB
    /**
     * Chunk size for session-based uploads.
     * Must be a multiple of 320 KiB (327,680 bytes).
     * 18 × 320 KiB = 5,898,240 bytes ≈ 5.625 MiB
     */
    static readonly CHUNK_SIZE = 18 * 320 * 1024; // 5,898,240 bytes

    constructor(private readonly _onNetworkRequest?: NetworkLogger) {}

    /**
     * Log a chunk-upload request after redaction.
     *
     * The upload-session URL is *pre-authenticated*: possessing it grants write access to
     * the file for the life of the session, so it is bearer-equivalent and must never be
     * recorded verbatim in the network drawer or a HAR export.
     */
    private _logChunkRequest(entry: NetworkRequest): void {
        this._onNetworkRequest?.(redactNetworkRequest(entry));
    }

    /**
     * List the children of a drive root (itemId undefined) or a specific folder.
     * driveId is the container ID (container.id === driveId).
     *
     * `onPage` receives **only the newly fetched page** each time the host completes one;
     * callers are responsible for accumulating. Sending the cumulative array across the
     * message boundary on every page would be quadratic for large folders.
     */
    async listChildren(
        driveId: string,
        itemId?: string,
        onPage?: (page: StorageItem[]) => void,
    ): Promise<StorageItem[]> {
        return request(
            'drive.listChildren',
            { driveId, itemId },
            onPage ? data => onPage(data as StorageItem[]) : undefined,
        );
    }

    /** Get a single drive item by ID. */
    async get(driveId: string, itemId: string): Promise<StorageItem | null> {
        return request('drive.get', { driveId, itemId });
    }

    /** Fetch rich details for a single drive item used by the properties panel. */
    async getDetailedDriveItem(driveId: string, itemId: string) {
        return request('drive.getDetailedDriveItem', { driveId, itemId });
    }

    /** Create a new folder. parentId null → create under drive root. */
    async createFolder(driveId: string, parentId: string | null, name: string): Promise<StorageItem> {
        return request('drive.createFolder', { driveId, parentId, name });
    }

    /** Create a new empty file. parentId null → create under drive root. */
    async createFile(driveId: string, parentId: string | null, name: string): Promise<StorageItem> {
        return request('drive.createFile', { driveId, parentId, name });
    }

    /** Rename a drive item. */
    async rename(driveId: string, itemId: string, newName: string): Promise<void> {
        return request('drive.rename', { driveId, itemId, newName });
    }

    /** Move a drive item to the recycle bin. */
    async delete(driveId: string, itemId: string): Promise<void> {
        return request('drive.delete', { driveId, itemId });
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    /**
     * Upload a file ≤ SMALL_FILE_THRESHOLD in a single PUT.
     * The bytes are handed to the extension host, which performs the authenticated PUT.
     */
    async uploadSmall(driveId: string, parentId: string | null, file: File): Promise<StorageItem> {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return request('drive.uploadSmall', {
            driveId,
            parentId,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            bytes,
        });
    }

    /**
     * Create a session for uploading a large file.
     * Returns the pre-authenticated uploadUrl (valid for ~24 hours).
     */
    async createUploadSession(driveId: string, parentId: string | null, fileName: string): Promise<string> {
        return request('drive.createUploadSession', { driveId, parentId, fileName });
    }

    /**
     * PUT one chunk of a large file to the session uploadUrl.
     * IMPORTANT: The session URL is pre-authenticated — no Authorization header must be
     * sent, and none is available in the webview. We use raw fetch() for this reason and
     * log the request via _onNetworkRequest.
     * Returns done=true + the completed StorageItem when the last chunk is accepted.
     */
    async uploadChunk(
        uploadUrl: string,
        file: File,
        offset: number,
        driveId: string,
    ): Promise<UploadChunkResult> {
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
            this._logChunkRequest({
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
        this._logChunkRequest({
            id: `chunk-${Date.now()}`,
            method: 'PUT',
            url: uploadUrl,
            status: resp.status,
            statusText: resp.statusText,
            durationMs,
            timestamp: new Date(start).toISOString(),
            requestHeaders,
            requestBody: `[${chunkSize} bytes, offset ${offset}–${end}]`,
            responseHeaders: Object.fromEntries([...resp.headers.entries()]),
            responseBody: responseText,
        });

        if (resp.status === 200 || resp.status === 201) {
            const body = JSON.parse(responseText || 'null');
            // The completed DriveItem comes back raw from SharePoint. Ask the host for the
            // projected StorageItem instead of duplicating the mapping logic here.
            let item: StorageItem | undefined;
            const createdId: string | undefined = body?.id;
            if (createdId) {
                item = (await this.get(driveId, createdId).catch(() => null)) ?? undefined;
            }
            return { done: true, nextOffset: file.size, item };
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

    // ── Recycle bin ───────────────────────────────────────────────────────────

    /** List items in the container's recycle bin. */
    async listRecycleBin(containerId: string): Promise<StorageItem[]> {
        return request('drive.listRecycleBin', { containerId });
    }

    /** Restore an item from the SPE container recycle bin. */
    async restoreFromRecycleBin(containerId: string, itemId: string): Promise<void> {
        return request('drive.restoreFromRecycleBin', { containerId, itemId });
    }

    /** Permanently delete an item from the SPE container recycle bin. */
    async permanentlyDelete(containerId: string, itemId: string): Promise<void> {
        return request('drive.permanentlyDelete', { containerId, itemId });
    }

    // ── List item fields ──────────────────────────────────────────────────────

    /** Get the listItem fields (custom metadata) for a drive item. */
    async getFields(driveId: string, itemId: string): Promise<Record<string, unknown>> {
        return request('drive.getFields', { driveId, itemId });
    }

    /** Update the listItem fields (custom metadata) for a drive item. */
    async updateFields(driveId: string, itemId: string, fields: Record<string, unknown>): Promise<void> {
        return request('drive.updateFields', { driveId, itemId, fields });
    }

    // ── Versions ──────────────────────────────────────────────────────────────

    /** List version history for a drive item. */
    async listVersions(driveId: string, itemId: string) {
        return request('drive.listVersions', { driveId, itemId });
    }

    /** Get a pre-authenticated download URL for a specific version. */
    async getVersionDownloadUrl(driveId: string, itemId: string, versionId: string): Promise<string> {
        return request('drive.getVersionDownloadUrl', { driveId, itemId, versionId });
    }

    /** Restore a prior version, making it the current version. */
    async restoreVersion(driveId: string, itemId: string, versionId: string): Promise<void> {
        return request('drive.restoreVersion', { driveId, itemId, versionId });
    }

    /** Permanently delete a specific version of a drive item. */
    async deleteVersion(driveId: string, itemId: string, versionId: string): Promise<void> {
        return request('drive.deleteVersion', { driveId, itemId, versionId });
    }

    // ── URLs ──────────────────────────────────────────────────────────────────

    /** Return the `webUrl` of the drive root or a specific folder item. */
    async getItemWebUrl(driveId: string, itemId?: string): Promise<string> {
        return request('drive.getItemWebUrl', { driveId, itemId });
    }

    /** Fetch a pre-authenticated download URL for a drive item. */
    async getDownloadUrl(driveId: string, itemId: string): Promise<string> {
        return request('drive.getDownloadUrl', { driveId, itemId });
    }

    /** Fetch an embeddable preview URL for a drive item. */
    async getPreviewUrl(driveId: string, itemId: string): Promise<string> {
        return request('drive.getPreviewUrl', { driveId, itemId });
    }
}
