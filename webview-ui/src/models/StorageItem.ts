export type ItemKind = 'container' | 'folder' | 'file';
export type SortColumn = 'name' | 'modified' | 'type' | 'size';
export type SortDirection = 'asc' | 'desc';
export type SidePanelTab = 'properties' | 'metadata' | 'versions' | 'permissions';

export interface StorageItem {
    id: string;
    name: string;
    kind: ItemKind;
    modifiedAt: string;
    type: string;
    size: string;
    description?: string;
    mimeType?: string;
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
    | { kind: 'retention-settings'; containerId: string; currentDays: number | null };

export type ViewMode =
    | { kind: 'normal' }
    | { kind: 'deleted-containers' }
    | { kind: 'container-recycle-bin'; containerId: string };
