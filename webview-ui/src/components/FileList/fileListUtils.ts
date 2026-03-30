import React from 'react';
import { StorageItem } from '../../models/StorageItem';

/** Returns the codicon class name for a given storage item. */
export function getItemIcon(item: StorageItem): string {
    if (item.kind === 'container') return 'codicon-database';
    if (item.kind === 'folder') return 'codicon-folder';
    const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
        case 'ts': case 'tsx': case 'js': case 'jsx': case 'py': case 'cs': case 'go':
        case 'java': case 'cpp': case 'c': case 'h': case 'rs':
            return 'codicon-file-code';
        case 'md': case 'txt': case 'log': case 'csv':
            return 'codicon-file-text';
        case 'docx': case 'doc': case 'pdf': case 'xlsx': case 'xls':
        case 'pptx': case 'ppt': case 'odt': case 'ods':
            return 'codicon-file';
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': case 'ico':
            return 'codicon-file-media';
        case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
            return 'codicon-file-zip';
        default:
            return 'codicon-file';
    }
}

/** Returns a VS Code CSS-variable color for the icon based on item kind. */
export function getItemIconColor(item: StorageItem): string {
    if (item.kind === 'container') return 'var(--vscode-symbolIcon-classForeground, #4ec9b0)';
    if (item.kind === 'folder') return 'var(--vscode-symbolIcon-namespaceForeground, #e8ab65)';
    return 'var(--vscode-foreground)';
}

const OFFICE_EXTENSIONS = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'odt', 'ods', 'odp']);

/** Returns true if the item is a file type that can be opened in Office Online / desktop. */
export function isOfficeFile(item: StorageItem): boolean {
    if (item.kind !== 'file') return false;
    const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
    return OFFICE_EXTENSIONS.has(ext);
}

/** Human-readable file size formatting. */
export function formatSize(size: string): string {
    return size || '—';
}
