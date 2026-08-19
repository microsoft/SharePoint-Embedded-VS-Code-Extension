import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { FileListHeader } from './FileListHeader';
import { FileListRow } from './FileListRow';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ListErrorState } from '../common/ListErrorState';

// Initial widths for: Date Modified, Type, Size (Name stays 1fr)
const INITIAL_COL_WIDTHS = [150, 130, 80];
// Estimated row height (px) — the virtualizer measures actual heights, this is just the seed.
const ESTIMATED_ROW_HEIGHT = 30;

export function FileList() {
    const {
        currentItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, navigate,
        filterText, isLoading, loadProgress, loadError, refresh, selectedIds, selectAllCurrent,
        clearSelected, canLoadMore, loadMore, isLoadingMore, loadMoreError, readiness, openModal,
        viewMode, currentDriveId,
    } = useStorageExplorer();
    const { colWidths } = useResizableColumns(INITIAL_COL_WIDTHS);
    const colTemplate = `32px 1fr ${colWidths[0]}px ${colWidths[1]}px ${colWidths[2]}px`;

    // The first thing a user needs is a container. Offer it prominently when a ready
    // container type has none, instead of the generic "this folder is empty".
    const showFirstContainerAction = readiness === 'ready'
        && viewMode.kind === 'normal'
        && currentDriveId === null
        && !filterText.trim()
        && !loadError;

    const allSelected = currentItems.length > 0 && currentItems.every(i => selectedIds.has(i.id));
    const someSelected = !allSelected && currentItems.some(i => selectedIds.has(i.id));
    const selectAllState: 'none' | 'some' | 'all' = allSelected ? 'all' : someSelected ? 'some' : 'none';
    const onToggleSelectAll = () => (allSelected ? clearSelected() : selectAllCurrent());

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
                selectAllState={selectAllState}
                onToggleSelectAll={onToggleSelectAll}
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
                    // A failed load must not masquerade as an empty folder.
                    loadError ? <ListErrorState error={loadError} onRetry={refresh} />
                        : showFirstContainerAction
                            ? <FirstContainerState onCreate={() => openModal({ kind: 'new-container' })} />
                            : <EmptyState filtered={!!filterText.trim()} />
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
                {/* Paging is explicit: the next page is fetched only when the user asks for it,
                    and the control disappears once the server says there is nothing left. */}
                {canLoadMore && (
                    <LoadMoreButton
                        onClick={() => void loadMore()}
                        isLoading={isLoadingMore}
                        error={loadMoreError}
                    />
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

/** Onboarding state for a ready container type that has no containers yet. */
function FirstContainerState({ onCreate }: { onCreate: () => void }) {
    return (
        <div
            data-testid="first-container-onboarding"
            onClick={e => e.stopPropagation()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                textAlign: 'center',
            }}
        >
            <span className="codicon codicon-new-folder" style={{ fontSize: 48, opacity: 0.6 }} />
            <span style={{ fontSize: 13, opacity: 0.8 }}>
                This container type has no containers yet.
            </span>
            <button
                type="button"
                data-testid="create-first-container"
                onClick={onCreate}
                style={{
                    padding: '6px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    border: 'none',
                    borderRadius: 2,
                    color: 'var(--vscode-button-foreground)',
                    backgroundColor: 'var(--vscode-button-background)',
                }}
            >
                Create your first container
            </button>
        </div>
    );
}

/**
 * Explicit control for fetching the next server page.
 *
 * Rendered at the bottom of the loaded rows and only while the host says another page
 * exists, so "no button" is an unambiguous statement that everything has been loaded.
 */
function LoadMoreButton({ onClick, isLoading, error }: { onClick: () => void; isLoading: boolean; error: string | null }) {
    return (
        <div
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 0' }}
        >
            <button
                type="button"
                data-testid="load-more"
                onClick={onClick}
                disabled={isLoading}
                aria-busy={isLoading}
                aria-label={isLoading ? 'Loading more items' : 'Load more items'}
                style={{
                    padding: '4px 14px',
                    fontSize: 12,
                    cursor: isLoading ? 'default' : 'pointer',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: 2,
                    color: 'var(--vscode-button-secondaryForeground)',
                    backgroundColor: 'var(--vscode-button-secondaryBackground)',
                }}
            >
                {isLoading
                    ? <span className="codicon codicon-loading codicon-modifier-spin" data-testid="load-more-spinner" />
                    : null}
                <span style={{ marginLeft: isLoading ? 6 : 0 }}>{isLoading ? 'Loading…' : 'Load more'}</span>
            </button>
            {error && (
                <span data-testid="load-more-error" role="alert" style={{ fontSize: 11, color: 'var(--vscode-errorForeground)' }}>
                    {error}
                </span>
            )}
        </div>
    );
}
