import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { FileListHeader } from './FileListHeader';
import { FileListRow } from './FileListRow';
import { useResizableColumns } from '../../hooks/useResizableColumns';

// Initial widths for: Date Modified, Type, Size (Name stays 1fr)
const INITIAL_COL_WIDTHS = [150, 130, 80];

export function FileList() {
    const { currentItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, navigate } = useStorageExplorer();
    const { colWidths, onColResizeMouseDown } = useResizableColumns(INITIAL_COL_WIDTHS);
    const colTemplate = `32px 1fr ${colWidths[0]}px ${colWidths[1]}px ${colWidths[2]}px`;

    return (
        <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
            onClick={() => selectItem(null)}
        >
            <FileListHeader
                colTemplate={colTemplate}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={setSort}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
                {currentItems.length === 0 ? (
                    <EmptyState />
                ) : (
                    currentItems.map(item => (
                        <FileListRow
                            key={item.id}
                            item={item}
                            colTemplate={colTemplate}
                            isSelected={selectedItem?.id === item.id}
                            onSelect={selectItem}
                            onNavigate={navigate}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                opacity: 0.5,
            }}
        >
            <span className="codicon codicon-inbox" style={{ fontSize: 48 }} />
            <span style={{ fontSize: 13 }}>This folder is empty</span>
        </div>
    );
}
