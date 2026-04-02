export type ItemKind = 'container' | 'folder' | 'file';
export type SortColumn = 'name' | 'modified' | 'type' | 'size';
export type SortDirection = 'asc' | 'desc';
export type SidePanelTab = 'properties' | 'metadata' | 'versions' | 'permissions' | 'columns' | 'settings';

export interface StorageItem {
    id: string;
    name: string;
    kind: ItemKind;
    modifiedAt: string;
    type: string;
    size: string;
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
     * (`ItemPreviewInfo.getUrl`).  Populated on demand after a preview call;
     * not available from a normal listing response.
     */
    previewUrl?: string;
}

export interface BreadcrumbEntry {
    label: string;
    /** null at the root (containers) level */
    id: string | null;
}

export type ModalState =
    | { kind: 'rename'; item: StorageItem }
    | { kind: 'delete'; item: StorageItem }
    | { kind: 'permanently-delete'; item: StorageItem }
    | { kind: 'retention-settings'; containerId: string; currentDays: number | null }
    | { kind: 'new-container' }
    | { kind: 'new-word' }
    | { kind: 'new-powerpoint' }
    | { kind: 'new-excel' }
    | { kind: 'new-folder' }
    | { kind: 'new-file' };

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

export type ViewMode =
    | { kind: 'normal' }
    | { kind: 'deleted-containers' }
    | { kind: 'container-recycle-bin'; containerId: string };

// ── Upload types ──────────────────────────────────────────────────────────────

export type UploadStatus = 'pending' | 'uploading' | 'paused' | 'completed' | 'failed';

export interface UploadFile {
    /** Unique ID for React keys and actions */
    id: string;
    /** Display name */
    name: string;
    /** Total bytes */
    size: number;
    /** Bytes uploaded so far */
    uploaded: number;
    status: UploadStatus;
    /** Error message when status === 'failed' */
    error?: string;
}
