import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { RecycledListHeader } from './RecycledListHeader';
import { RecycledListRow } from './RecycledListRow';
import { useResizableColumns } from '../../hooks/useResizableColumns';

// Initial widths for container-recycle-bin: [Date Deleted, Type]
// Initial widths for deleted-containers: [Created, Deleted, Type]
const INITIAL_COL_WIDTHS_RECYCLE = [150, 120];
const INITIAL_COL_WIDTHS_DELETED = [140, 140, 120];

export function RecycledList() {
    const { currentRecycledItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, viewMode } = useStorageExplorer();
    const isDeletedContainers = viewMode.kind === 'deleted-containers';
    const { colWidths: colWidthsRecycle } = useResizableColumns(INITIAL_COL_WIDTHS_RECYCLE);
    const { colWidths: colWidthsDeleted } = useResizableColumns(INITIAL_COL_WIDTHS_DELETED);
    const colTemplate = isDeletedContainers
        ? `32px 1fr ${colWidthsDeleted[0]}px ${colWidthsDeleted[1]}px ${colWidthsDeleted[2]}px`
        : `32px 1fr ${colWidthsRecycle[0]}px ${colWidthsRecycle[1]}px`;

    const emptyMessage = viewMode.kind === 'deleted-containers'
        ? 'No deleted containers'
        : 'Recycle bin is empty';

    return (
        <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
            onClick={() => selectItem(null)}
        >
            <RecycledListHeader
                colTemplate={colTemplate}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={setSort}
                isDeletedContainers={isDeletedContainers}
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
                            colTemplate={colTemplate}
                            isDeletedContainers={isDeletedContainers}
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
