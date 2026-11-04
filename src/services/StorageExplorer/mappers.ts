/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DriveItem, FileStorageContainer } from '@microsoft/microsoft-graph-types';
import { StorageItem } from './protocol';

/**
 * Shared response → view-model mappers for the Storage Explorer.
 *
 * These previously lived alongside the webview Graph services. They moved to the
 * extension host together with the Graph calls so the webview only ever receives
 * already-projected view models.
 */

export function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) { return ''; }
    if (bytes === 0) { return '0 B'; }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) { return ''; }
    try {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

/**
 * A timestamp for ordering, in epoch milliseconds.
 *
 * The display string `formatDate` produces sorts as text by month name, so every mapped item
 * also carries this value for the fixed newest-first ordering to sort on.
 */
export function toEpochMillis(dateStr: string | null | undefined): number | undefined {
    if (!dateStr) { return undefined; }
    const parsed = Date.parse(dateStr);
    return Number.isNaN(parsed) ? undefined : parsed;
}

const FILE_TYPE_MAP: Record<string, string> = {
    DOCX: 'Word Document', DOC: 'Word Document',
    XLSX: 'Excel Workbook', XLS: 'Excel Workbook',
    PPTX: 'PowerPoint Presentation', PPT: 'PowerPoint Presentation',
    PDF: 'PDF Document',
    PNG: 'PNG Image', JPG: 'JPEG Image', JPEG: 'JPEG Image', GIF: 'GIF Image', WEBP: 'WebP Image',
    TXT: 'Text Document', CSV: 'CSV File',
    ZIP: 'ZIP Archive', RAR: 'RAR Archive',
    MP4: 'MP4 Video', MOV: 'MOV Video', MP3: 'MP3 Audio',
};

export function getFileType(item: DriveItem): string {
    if (item.folder) { return 'Folder'; }
    const name = item.name ?? '';
    const ext = name.indexOf('.') !== -1 ? name.split('.').pop()?.toUpperCase() : null;
    if (!ext) { return 'File'; }
    return FILE_TYPE_MAP[ext] ?? `${ext} File`;
}

export function driveItemToStorageItem(item: DriveItem): StorageItem {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = item as any;
    return {
        id: item.id ?? '',
        name: item.name ?? '(unnamed)',
        kind: item.folder ? 'folder' : 'file',
        modifiedAt: formatDate(item.lastModifiedDateTime),
        modifiedTs: toEpochMillis(item.lastModifiedDateTime),
        createdAt: formatDate(item.createdDateTime),
        type: getFileType(item),
        size: formatBytes(item.size),
        sizeBytes: item.size ?? 0,
        mimeType: item.file?.mimeType ?? undefined,
        webUrl: item.webUrl ?? undefined,
        downloadUrl: raw['@microsoft.graph.downloadUrl'] ?? undefined,
    };
}

export function containerToStorageItem(c: FileStorageContainer): StorageItem {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = c as any;
    const quotaUsed: number | null | undefined = raw.drive?.quota?.used;
    const rawStatus = typeof c.status === 'string' ? c.status.toLowerCase() : null;
    const status: StorageItem['status'] =
        rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : null;
    return {
        id: c.id ?? '',
        name: c.displayName ?? '(unnamed)',
        kind: 'container',
        createdAt: formatDate(c.createdDateTime),
        modifiedAt: formatDate(c.createdDateTime),
        modifiedTs: toEpochMillis(c.createdDateTime),
        type: 'Container',
        size: formatBytes(quotaUsed),
        sizeBytes: quotaUsed ?? 0,
        description: c.description ?? undefined,
        containerTypeId: c.containerTypeId ?? undefined,
        lockState: (c.lockState as StorageItem['lockState']) ?? null,
        status,
        sensitivityLabel: raw.assignedSensitivityLabel ?? null,
    };
}

/** Item shape returned by the SPE container `recycleBin/items` endpoint. */
export interface RecycleBinItem {
    id?: string;
    name?: string;
    size?: number;
    deletedDateTime?: string;
    deletedFromLocation?: string;
}

export function recycleBinItemToStorageItem(item: RecycleBinItem): StorageItem {
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
        modifiedTs: toEpochMillis(item.deletedDateTime),
        deletedAt: formatDate(item.deletedDateTime),
        createdAt: '',
        type: kind === 'folder' ? 'Folder' : getFileType({ name } as DriveItem),
        size: formatBytes(item.size),
        sizeBytes: item.size ?? 0,
    };
}
