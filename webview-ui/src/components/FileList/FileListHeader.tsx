import React from 'react';
import { SortColumn, SortDirection } from '../../models/StorageItem';

const COL_TEMPLATE = '32px 1fr 150px 130px 80px';

interface FileListHeaderProps {
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    onSort: (col: SortColumn) => void;
    onClick?: (e: React.MouseEvent) => void;
}

interface ColDef {
    key: SortColumn | null;
    label: string;
    align?: 'right';
}

const COLUMNS: ColDef[] = [
    { key: null, label: '' },          // checkbox
    { key: 'name', label: 'Name' },
    { key: 'modified', label: 'Date Modified' },
    { key: 'type', label: 'Type' },
    { key: 'size', label: 'Size', align: 'right' },
];

export { COL_TEMPLATE };

export function FileListHeader({ sortColumn, sortDirection, onSort, onClick }: FileListHeaderProps) {
    const arrow = sortDirection === 'asc' ? 'codicon-arrow-up' : 'codicon-arrow-down';

    return (
        <div
            onClick={onClick}
            style={{
                display: 'grid',
                gridTemplateColumns: COL_TEMPLATE,
                borderBottom: '1px solid var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-editor-background)',
                position: 'sticky',
                top: 0,
                zIndex: 1,
                userSelect: 'none',
            }}
        >
            {COLUMNS.map((col, i) => (
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
                    }}
                >
                    {col.label}
                    {col.key && sortColumn === col.key && (
                        <span className={`codicon ${arrow}`} style={{ fontSize: 10 }} />
                    )}
                </div>
            ))}
        </div>
    );
}
