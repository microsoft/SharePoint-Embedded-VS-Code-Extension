import React, { useState } from 'react';
import { StorageItem } from '../../models/StorageItem';
import { getItemIcon, getItemIconColor } from '../FileList/fileListUtils';
import { RecycledContextMenu } from './RecycledContextMenu';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

interface RecycledListRowProps {
    item: StorageItem;
    isSelected: boolean;
    onSelect: (item: StorageItem) => void;
    colTemplate: string;
    isDeletedContainers?: boolean;
}

export function RecycledListRow({ item, isSelected, onSelect, colTemplate, isDeletedContainers }: RecycledListRowProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const { openModal } = useStorageExplorer();

    const icon = getItemIcon(item);
    const iconColor = getItemIconColor(item);
    const showInlineActions = isHovered || isSelected;

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

    function handleContextMenuBtn(e: React.MouseEvent) {
        e.stopPropagation();
        onSelect(item);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setContextMenu({ x: rect.left, y: rect.bottom + 2 });
    }

    return (
        <>
            <div
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
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Checkbox column */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelect(item)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                    />
                </div>

                {/* Name column — icon + name text + inline action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 4px 0', overflow: 'hidden', minWidth: 0 }}>
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

                    {/* Inline action buttons */}
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
                        <button
                            className="icon-btn"
                            title="More actions"
                            style={{ fontSize: 14, padding: '2px 4px' }}
                            onClick={handleContextMenuBtn}
                        >
                            <span className="codicon codicon-ellipsis" />
                        </button>
                        <button
                            className="icon-btn"
                            title="Restore"
                            style={{ fontSize: 14, padding: '2px 4px' }}
                            onClick={() => { /* TODO */ }}
                        >
                            <span className="codicon codicon-redo" />
                        </button>
                        <button
                            className="icon-btn"
                            title="Permanently delete"
                            style={{ fontSize: 14, padding: '2px 4px', color: 'var(--vscode-errorForeground)' }}
                            onClick={() => openModal({ kind: 'permanently-delete', item })}
                        >
                            <span className="codicon codicon-trash" />
                        </button>
                    </div>
                </div>

                {/* Date(s) */}
                {isDeletedContainers ? (
                    <>
                        <div style={{ padding: '5px 8px', whiteSpace: 'nowrap', opacity: 0.8 }}>{item.createdAt}</div>
                        <div style={{ padding: '5px 8px', whiteSpace: 'nowrap', opacity: 0.8 }}>{item.deletedAt || '—'}</div>
                    </>
                ) : (
                    <div style={{ padding: '5px 8px', whiteSpace: 'nowrap', opacity: 0.8 }}>{item.modifiedAt}</div>
                )}

                {/* Type */}
                <div style={{ padding: '5px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8 }}>{item.type}</div>
            </div>

            {contextMenu && (
                <RecycledContextMenu
                    item={item}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </>
    );
}
