import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { RecycledListHeader } from './RecycledListHeader';
import { RecycledListRow } from './RecycledListRow';

export function RecycledList() {
    const { currentRecycledItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, viewMode } = useStorageExplorer();

    const emptyMessage = viewMode.kind === 'deleted-containers'
        ? 'No deleted containers'
        : 'Recycle bin is empty';

    return (
        <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
            onClick={() => selectItem(null)}
        >
            <RecycledListHeader
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={setSort}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
                {currentRecycledItems.length === 0 ? (
                    <EmptyState message={emptyMessage} />
                ) : (
                    currentRecycledItems.map(item => (
                        <RecycledListRow
                            key={item.id}
                            item={item}
                            isSelected={selectedItem?.id === item.id}
                            onSelect={selectItem}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
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
            <span className="codicon codicon-trash" style={{ fontSize: 48 }} />
            <span style={{ fontSize: 13 }}>{message}</span>
        </div>
    );
}
