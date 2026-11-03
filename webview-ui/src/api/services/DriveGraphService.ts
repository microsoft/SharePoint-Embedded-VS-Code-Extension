import { request } from '../rpc';
import type { PagedResult, StorageItem, UploadChunkResult } from '../protocol';

// Re-exported for the panels that consume these shapes (FilePropertiesPanel, VersionsPanel).
export type { DriveItemDetails, DriveItemVersion } from '../protocol';

/**
 * Drive item operations.
 *
 * Graph and upload-session calls are executed by the extension host so the webview
 * never holds a bearer token or an upload-session URL.
 */
export class DriveGraphService {
    /** Upper bound for a one-message upload; larger files cross the boundary in chunks. */
    static readonly SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MiB
    static readonly GRAPH_UPLOAD_LIMIT = 250_000_000;
    /**
     * Chunk size for session-based uploads.
     * Must be a multiple of 320 KiB (327,680 bytes).
     * 18 × 320 KiB = 5,898,240 bytes ≈ 5.625 MiB
     */
    static readonly CHUNK_SIZE = 18 * 320 * 1024; // 5,898,240 bytes

    /**
     * List the **first page** of children of a drive root (itemId undefined) or a folder.
     * driveId is the container ID (container.id === driveId).
     *
     * Only one server page is fetched. The `continuation` handle in the result is opaque and
     * is redeemed through `collections.loadMore` when the user asks for more, so opening a
     * large folder costs exactly one Graph request.
     */
    async listChildren(driveId: string, itemId?: string): Promise<PagedResult<StorageItem>> {
        return request('drive.listChildren', { driveId, itemId });
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
     * Create a staged Graph upload up to 250 MB, otherwise a resumable upload session.
     * Returns an opaque handle; all transport state remains on the host.
     */
    async createUploadSession(driveId: string, parentId: string | null, file: File): Promise<string> {
        return request('drive.createUploadSession', {
            driveId, parentId, fileName: file.name, fileSize: file.size,
            contentType: file.type || 'application/octet-stream',
        });
    }

    /**
     * Transfer at most one chunk to the host, which selects the session's authentication.
     * Returns done=true + the completed StorageItem when the last chunk is accepted.
     */
    async uploadChunk(
        sessionId: string,
        file: File,
        offset: number,
        driveId: string,
    ): Promise<UploadChunkResult> {
        const chunk = file.slice(offset, offset + DriveGraphService.CHUNK_SIZE);
        const bytes = new Uint8Array(await chunk.arrayBuffer());
        return request('drive.uploadChunk', { driveId, sessionId, offset, total: file.size, bytes });
    }

    /** DELETE an upload session to abort / clean up a large-file upload. */
    async cancelUploadSession(driveId: string, sessionId: string): Promise<void> {
        try {
            await request('drive.cancelUploadSession', { driveId, sessionId });
        } catch {
            // Best-effort cleanup; cancellation failures are logged by the host.
        }
    }

    // ── Recycle bin ───────────────────────────────────────────────────────────

    /** List the first page of items in the container's recycle bin. */
    async listRecycleBin(containerId: string): Promise<PagedResult<StorageItem>> {
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

    /** Return the `webUrl` of the drive root, folder, or file. */
    async getItemWebUrl(driveId: string, itemId?: string): Promise<string> {
        return request('drive.getItemWebUrl', { driveId, itemId });
    }

    /** Fetch a pre-authenticated download URL for a drive item. */
    async getDownloadUrl(driveId: string, itemId: string): Promise<string> {
        return request('drive.getDownloadUrl', { driveId, itemId });
    }

    /** Ask the host to save authenticated content using its native Save As dialog. */
    async download(driveId: string, itemId: string): Promise<void> {
        return request('drive.download', { driveId, itemId });
    }

    /** Fetch an embeddable preview URL for a drive item. */
    async getPreviewUrl(driveId: string, itemId: string): Promise<string> {
        return request('drive.getPreviewUrl', { driveId, itemId });
    }

    /** Open Graph-streamed PDF content using the host's temporary local viewer. */
    async openPdf(driveId: string, itemId: string): Promise<void> {
        return request('drive.openPdf', { driveId, itemId });
    }

    /** Open Graph-streamed MP4 content using the host's temporary local player. */
    async openVideo(driveId: string, itemId: string): Promise<void> {
        return request('drive.openVideo', { driveId, itemId });
    }
}
