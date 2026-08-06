// Shapes shared with the extension host live in the protocol contract so both
// sides stay in sync. Re-exported here to keep existing import paths working.
export type { ItemKind, NetworkRequest, StorageItem } from '../api/protocol';

export type SortColumn = 'name' | 'modified' | 'type' | 'size';
export type SortDirection = 'asc' | 'desc';
export type SidePanelTab = 'properties' | 'metadata' | 'versions' | 'permissions' | 'columns' | 'settings';

import type { StorageItem } from '../api/protocol';

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
