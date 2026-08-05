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
    selectAllState?: 'none' | 'some' | 'all';
    onToggleSelectAll?: () => void;
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

const SORT_TEST_IDS: Partial<Record<SortColumn, string>> = {
    name: 'sort-name',
    modified: 'sort-modified',
    type: 'sort-type',
    size: 'sort-size',
};

export function FileListHeader({ colTemplate, sortColumn, sortDirection, onSort, onColResize, onClick, selectAllState, onToggleSelectAll }: FileListHeaderProps) {
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
                        data-testid={col.key ? SORT_TEST_IDS[col.key] : undefined}
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
                        {i === 0 && onToggleSelectAll ? (
                            <div
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                                onClick={e => e.stopPropagation()}
                            >
                                <input
                                    type="checkbox"
                                    data-testid="select-all"
                                    title="Select all"
                                    checked={selectAllState === 'all'}
                                    ref={el => { if (el) { el.indeterminate = selectAllState === 'some'; } }}
                                    onChange={onToggleSelectAll}
                                    style={{ cursor: 'pointer' }}
                                />
                            </div>
                        ) : (
                            <>
                                {col.label}
                                {col.key && sortColumn === col.key && (
                                    <span className={`codicon ${arrow}`} style={{ fontSize: 10 }} />
                                )}
                                {showHandle && (
                                    <ColResizeHandle side="left" onMouseDown={e => onColResize!(e, fixedIdx, -1)} />
                                )}
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
