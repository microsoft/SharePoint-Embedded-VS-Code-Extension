import React, { useState } from 'react';
import { StorageItem } from '../../models/StorageItem';
import { getItemIcon, getItemIconColor, formatSize, isOfficeFile } from './fileListUtils';
import { ContextMenu } from '../ContextMenu/ContextMenu';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { openUrl } from '../../utils/openUrl';

interface FileListRowProps {
    item: StorageItem;
    isSelected: boolean;
    onSelect: (item: StorageItem) => void;
    onNavigate: (item: StorageItem) => void;
    colTemplate: string;
}

export function FileListRow({ item, isSelected, onSelect, onNavigate, colTemplate }: FileListRowProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const {
        previewItem, downloadItem, selectedIds, toggleSelected,
        missingPermissionMessage, requireOperation,
    } = useStorageExplorer();

    const icon = getItemIcon(item);
    const iconColor = getItemIconColor(item);
    const showInlineActions = isHovered || isSelected;
    const isFile = item.kind === 'file';
    const isOffice = isFile && isOfficeFile(item);
    const readContentMessage = missingPermissionMessage('drive.getPreviewUrl');

    const rowBg = isSelected
        ? 'var(--vscode-list-activeSelectionBackground)'
        : isHovered
          ? 'var(--vscode-list-hoverBackground)'
          : 'transparent';

    const rowColor = isSelected
        ? 'var(--vscode-list-activeSelectionForeground)'
        : 'var(--vscode-foreground)';

    function handleClick(e: React.MouseEvent) {
        e.stopPropagation();
        onSelect(item);
    }

    function handleDoubleClick() {
        if (item.kind !== 'file') { onNavigate(item); return; }
        if (!requireOperation('drive.getPreviewUrl')) { return; }
        if (isOffice) { item.webUrl && openUrl(item.webUrl); }
        else { previewItem(item); }
    }

    function handleContextMenuBtn(e: React.MouseEvent) {
        e.stopPropagation();
        onSelect(item);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setContextMenu({ x: rect.left, y: rect.bottom + 2 });
    }

    return (
        <>
            <div
                data-testid={`file-row-${item.name}`}
                data-item-id={item.id}
                style={{
                    display: 'grid',
                    gridTemplateColumns: colTemplate,
                    backgroundColor: rowBg,
                    color: rowColor,
                    cursor: 'default',
                    alignItems: 'center',
                    borderRadius: 2,
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Checkbox column */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input
                        type="checkbox"
                        data-testid="file-row-checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                    />
                </div>

                {/* Name column — icon + name text + inline action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '4px 8px 4px 0', overflow: 'hidden', minWidth: 0 }}>
                    <span
                        className={`codicon ${icon}`}
                        style={{ fontSize: 16, color: iconColor, flexShrink: 0, marginRight: 6 }}
                    />
                    <span
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                        title={item.name}
                    >
                        {item.name}
                    </span>

                    {/* Inline action buttons — always in DOM to prevent layout shift */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexShrink: 0,
                            marginLeft: 4,
                            opacity: showInlineActions ? 1 : 0,
                            pointerEvents: showInlineActions ? 'auto' : 'none',
                            transition: 'opacity 0.1s',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Context menu (ellipsis) */}
                        <button
                            className="icon-btn"
                            title="More actions"
                            data-testid="file-row-menu"
                            style={{ fontSize: 14, padding: '2px 4px' }}
                            onClick={handleContextMenuBtn}
                        >
                            <span className="codicon codicon-ellipsis" />
                        </button>

                        {/* Open (Office only — open in browser) */}
                        <button
                            className="icon-btn"
                            title={readContentMessage ?? 'Open in browser'}
                            aria-disabled={!isOffice || !!readContentMessage}
                            style={{ fontSize: 14, padding: '2px 4px', opacity: isOffice && !readContentMessage ? 1 : 0.25 }}
                            disabled={!isOffice}
                            onClick={() => {
                                if (!requireOperation('drive.getPreviewUrl')) { return; }
                                item.webUrl && openUrl(item.webUrl);
                            }}
                        >
                            <span className="codicon codicon-globe" />
                        </button>

                        {/* Preview */}
                        <button
                            className="icon-btn"
                            title={readContentMessage ?? 'Preview'}
                            aria-disabled={!isFile || !!readContentMessage}
                            style={{ fontSize: 14, padding: '2px 4px', opacity: isFile && !readContentMessage ? 1 : 0.25 }}
                            disabled={!isFile}
                            onClick={() => { previewItem(item); }}
                        >
                            <span className="codicon codicon-eye" />
                        </button>

                        {/* Download */}
                        <button
                            className="icon-btn"
                            title={missingPermissionMessage('drive.getDownloadUrl') ?? 'Download'}
                            aria-disabled={!isFile || !!missingPermissionMessage('drive.getDownloadUrl')}
                            style={{
                                fontSize: 14,
                                padding: '2px 4px',
                                opacity: isFile && !missingPermissionMessage('drive.getDownloadUrl') ? 1 : 0.25,
                            }}
                            disabled={!isFile}
                            onClick={() => { downloadItem(item); }}
                        >
                            <span className="codicon codicon-cloud-download" />
                        </button>
                    </div>
                </div>

                {/* Date Modified */}
                <div style={{ padding: '5px 8px', whiteSpace: 'nowrap', opacity: 0.8 }}>{item.modifiedAt}</div>

                {/* Type */}
                <div style={{ padding: '5px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8 }}>{item.type}</div>

                {/* Size */}
                <div style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap', opacity: 0.8 }}>{formatSize(item.size)}</div>
            </div>

            {contextMenu && (
                <ContextMenu
                    item={item}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </>
    );
}
