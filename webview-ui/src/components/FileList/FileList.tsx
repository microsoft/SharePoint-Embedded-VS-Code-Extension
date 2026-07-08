import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { FileListHeader } from './FileListHeader';
import { FileListRow } from './FileListRow';
import { useResizableColumns } from '../../hooks/useResizableColumns';

// Initial widths for: Date Modified, Type, Size (Name stays 1fr)
const INITIAL_COL_WIDTHS = [150, 130, 80];
// Estimated row height (px) — the virtualizer measures actual heights, this is just the seed.
const ESTIMATED_ROW_HEIGHT = 30;

export function FileList() {
    const { currentItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, navigate, filterText, isLoading, loadProgress } = useStorageExplorer();
    const { colWidths } = useResizableColumns(INITIAL_COL_WIDTHS);
    const colTemplate = `32px 1fr ${colWidths[0]}px ${colWidths[1]}px ${colWidths[2]}px`;

    const scrollRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: currentItems.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ESTIMATED_ROW_HEIGHT,
        overscan: 12,
        getItemKey: (index) => currentItems[index]?.id ?? index,
    });

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
            {isLoading && (
                <div
                    data-testid="list-loading"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 10px',
                        fontSize: 12,
                        opacity: 0.85,
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        backgroundColor: 'var(--vscode-editor-background)',
                        flexShrink: 0,
                    }}
                >
                    <span className="codicon codicon-loading codicon-modifier-spin" />
                    <span>{loadProgress > 0 ? `Loading… ${loadProgress.toLocaleString()} items so far` : 'Loading…'}</span>
                </div>
            )}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
                {currentItems.length === 0 ? (
                    <EmptyState filtered={!!filterText.trim()} />
                ) : (
                    // Virtualized: only the rows in (and near) the viewport are mounted, so the DOM
                    // stays O(viewport) regardless of how many items the enumeration returns.
                    <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                        {rowVirtualizer.getVirtualItems().map(virtualRow => {
                            const item = currentItems[virtualRow.index];
                            return (
                                <div
                                    key={virtualRow.key}
                                    data-index={virtualRow.index}
                                    ref={rowVirtualizer.measureElement}
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                >
                                    <FileListRow
                                        item={item}
                                        colTemplate={colTemplate}
                                        isSelected={selectedItem?.id === item.id}
                                        onSelect={selectItem}
                                        onNavigate={navigate}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyState({ filtered }: { filtered: boolean }) {
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
            <span className={`codicon ${filtered ? 'codicon-search-stop' : 'codicon-inbox'}`} style={{ fontSize: 48 }} />
            <span style={{ fontSize: 13 }} data-testid="filelist-empty">{filtered ? 'No items match your filter' : 'This folder is empty'}</span>
        </div>
    );
}
