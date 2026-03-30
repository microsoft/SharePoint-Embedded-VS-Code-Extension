import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { FileListHeader } from './FileListHeader';
import { FileListRow } from './FileListRow';

export function FileList() {
    const { currentItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, navigate } = useStorageExplorer();

    return (
        <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
            onClick={() => selectItem(null)} // deselect when clicking the empty area
        >
            <FileListHeader sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSort} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
                {currentItems.length === 0 ? (
                    <EmptyState />
                ) : (
                    currentItems.map(item => (
                        <FileListRow
                            key={item.id}
                            item={item}
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
