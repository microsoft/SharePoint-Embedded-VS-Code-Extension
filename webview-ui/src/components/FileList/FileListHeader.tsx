import React from 'react';
import { SortColumn, SortDirection } from '../../models/StorageItem';
import { ColResizeHandle } from '../../hooks/useResizableColumns';

interface FileListHeaderProps {
    colTemplate: string;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    onSort: (col: SortColumn) => void;
    onColResize?: (e: React.MouseEvent, idx: number, direction?: number) => void;
    onClick?: (e: React.MouseEvent) => void;
}

interface ColDef {
    key: SortColumn | null;
    label: string;
    align?: 'right';
}

const COLUMNS: ColDef[] = [
    { key: null, label: '' },
    { key: 'name', label: 'Name' },
    { key: 'modified', label: 'Date Modified' },
    { key: 'type', label: 'Type' },
    { key: 'size', label: 'Size', align: 'right' },
];

export function FileListHeader({ colTemplate, sortColumn, sortDirection, onSort, onColResize, onClick }: FileListHeaderProps) {
    const arrow = sortDirection === 'asc' ? 'codicon-arrow-up' : 'codicon-arrow-down';

    return (
        <div
            onClick={onClick}
            style={{
                display: 'grid',
                gridTemplateColumns: colTemplate,
                borderBottom: '1px solid var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-editor-background)',
                position: 'sticky',
                top: 0,
                zIndex: 1,
                userSelect: 'none',
            }}
        >
            {COLUMNS.map((col, i) => {
                // Left-edge handle on all fixed-width columns (i >= 2)
                const showHandle = onColResize && i >= 2;
                const fixedIdx = i - 2;
                return (
                    <div
                        key={i}
                        onClick={() => col.key && onSort(col.key)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 8px',
                            cursor: col.key ? 'pointer' : 'default',
                            justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                            fontSize: 11,
                            fontWeight: 600,
                            opacity: 0.7,
                            whiteSpace: 'nowrap',
                            position: showHandle ? 'relative' : undefined,
                        }}
                    >
                        {col.label}
                        {col.key && sortColumn === col.key && (
                            <span className={`codicon ${arrow}`} style={{ fontSize: 10 }} />
                        )}
                        {showHandle && (
                            <ColResizeHandle side="left" onMouseDown={e => onColResize!(e, fixedIdx, -1)} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
