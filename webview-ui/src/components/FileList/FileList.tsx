import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { FileListHeader } from './FileListHeader';
import { FileListRow } from './FileListRow';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ListErrorState } from '../common/ListErrorState';
import type { StorageExplorerOperation } from '../../api/protocol';

// Initial widths for: Date Modified, Type, Size (Name stays 1fr)
const INITIAL_COL_WIDTHS = [150, 130, 80];
// Estimated row height (px) — the virtualizer measures actual heights, this is just the seed.
const ESTIMATED_ROW_HEIGHT = 30;

/**
 * The operations that make a view worth being in: adding content to it, and opening the
 * content it holds.
 *
 * An empty listing is only trustworthy as "there is nothing here" once these are granted.
 * Until then the emptiness and the missing grant are indistinguishable to the user, so the
 * view reports the grant rather than asserting the folder is empty.
 */
const CONTENT_OPERATIONS_AT_ROOT: readonly StorageExplorerOperation[] = ['containers.create'];
const CONTENT_OPERATIONS_IN_DRIVE: readonly StorageExplorerOperation[] = [
    'drive.uploadSmall',
    'drive.createFolder',
    'drive.createFile',
    'drive.getDownloadUrl',
];

export function FileList() {
    const {
        currentItems, selectedItem, selectItem, setSort, sortColumn, sortDirection, navigate,
        filterText, isLoading, loadProgress, loadError, refresh, selectedIds, selectAllCurrent,
        clearSelected, canLoadMore, loadMore, isLoadingMore, loadMoreError, readiness, openModal,
        viewMode, currentDriveId, missingPermissionMessage, missingScopesForOperation, requireOperation,
    } = useStorageExplorer();
    const { colWidths } = useResizableColumns(INITIAL_COL_WIDTHS);
    const colTemplate = `32px 1fr ${colWidths[0]}px ${colWidths[1]}px ${colWidths[2]}px`;

    const atRoot = currentDriveId === null;
    const isNormalView = viewMode.kind === 'normal';
    const isFiltered = !!filterText.trim();

    // What produced the view on screen, so an empty result can be attributed to the grant
    // that actually gates it.
    const listOperation = atRoot ? 'containers.list' : 'drive.listChildren';
    const listMissingScopes = missingScopesForOperation(listOperation);

    // Listing is granted but the view is still crippled: the scopes that would let the user
    // put something here, or open what is already here.
    const contentOperations = atRoot ? CONTENT_OPERATIONS_AT_ROOT : CONTENT_OPERATIONS_IN_DRIVE;
    const contentMissingScopes = Array.from(
        new Set(contentOperations.flatMap(operation => missingScopesForOperation(operation)))
    ).sort();

    // The first thing a user needs is a container. Offer it prominently when a ready
    // container type has none, instead of the generic "this folder is empty".
    const showFirstContainerAction = readiness === 'ready'
        && isNormalView
        && atRoot
        && !isFiltered
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
                        // Neither may a listing the extension app was never allowed to make.
                        // Graph answers an under-permissioned enumeration with an empty page
                        // rather than an error, so "no items" here is not evidence of "nothing
                        // to show" until the grant behind the listing is accounted for.
                        : listMissingScopes.length > 0
                            ? <MissingListPermissionState scopes={listMissingScopes} atRoot={atRoot} />
                            // A filter that matched nothing is the user's own doing, and saying
                            // so beats attributing it to a permission they cannot act on here.
                            : isFiltered
                                ? <EmptyState filtered />
                                // Listing worked and the folder really is empty. Whether that is
                                // an invitation or a dead end depends on what the user may add.
                                : isNormalView && contentMissingScopes.length > 0
                                    ? <EmptyAndBlockedState scopes={contentMissingScopes} atRoot={atRoot} />
                                    : showFirstContainerAction
                                        ? <FirstContainerState
                                            permissionMessage={missingPermissionMessage('containers.create')}
                                            onCreate={() => {
                                                if (requireOperation('containers.create')) {
                                                    openModal({ kind: 'new-container' });
                                                }
                                            }}
                                        />
                                        : isNormalView && !atRoot
                                            ? <EmptyFolderState />
                                            : <EmptyState filtered={false} />
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

/**
 * Shown instead of "this folder is empty" when the grant behind the listing is incomplete.
 *
 * The distinction matters: an empty enumeration the extension app was not entitled to make
 * is indistinguishable from a genuinely empty one, and the second reading sends the user
 * looking for missing data instead of a missing permission.
 */
function MissingListPermissionState({ scopes, atRoot }: { scopes: string[]; atRoot: boolean }) {
    return (
        <div
            data-testid="list-missing-permission"
            onClick={e => e.stopPropagation()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                padding: '0 24px',
                textAlign: 'center',
            }}
        >
            <span
                className="codicon codicon-shield"
                style={{ fontSize: 48, color: 'var(--vscode-editorWarning-foreground)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
                {atRoot ? 'Containers can\'t be listed' : 'This folder can\'t be listed'}
            </span>
            <span style={{ fontSize: 12, opacity: 0.85, maxWidth: 480 }} data-testid="list-missing-permission-scopes">
                The SharePoint Embedded extension app needs the {scopes.join(', ')} app{' '}
                {scopes.length === 1 ? 'permission' : 'permissions'} on this container type.
                Until it has {scopes.length === 1 ? 'it' : 'them'}, this list stays empty even
                when {atRoot ? 'containers' : 'items'} exist.
            </span>
            <GrantPermissionsButton testId="list-missing-permission-grant" />
        </div>
    );
}

/**
 * The folder really is empty, and the grant leaves the user no way to change that.
 *
 * Distinct from {@link MissingListPermissionState}: listing succeeded, so the emptiness is
 * real. What is missing is the ability to act on it — offering "upload a file" here would
 * lead straight into a denial, and the plain empty state would imply the user simply hasn't
 * got round to it. Naming the scope is the only honest reading.
 */
function EmptyAndBlockedState({ scopes, atRoot }: { scopes: string[]; atRoot: boolean }) {
    return (
        <div
            data-testid="empty-missing-permission"
            onClick={e => e.stopPropagation()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                padding: '0 24px',
                textAlign: 'center',
            }}
        >
            <span
                className="codicon codicon-shield"
                style={{ fontSize: 48, color: 'var(--vscode-editorWarning-foreground)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
                {atRoot ? 'No containers yet' : 'This folder is empty'}
            </span>
            <span style={{ fontSize: 12, opacity: 0.85, maxWidth: 480 }} data-testid="empty-missing-permission-scopes">
                {atRoot
                    ? 'Creating a container needs the '
                    : 'Adding and opening files needs the '}
                {scopes.join(', ')} app {scopes.length === 1 ? 'permission' : 'permissions'} on
                this container type. Grant {scopes.length === 1 ? 'it' : 'them'} to start adding
                content here.
            </span>
            <GrantPermissionsButton testId="empty-missing-permission-grant" />
        </div>
    );
}

/**
 * An empty folder the user is fully entitled to fill.
 *
 * Reached only once every content scope for this view is granted, so every action offered
 * here is guaranteed to be permitted — an empty folder should read as an invitation, not a
 * dead end.
 */
function EmptyFolderState() {
    const { openModal, enqueueUploads, requireOperation } = useStorageExplorer();
    const fileInputRef = useRef<HTMLInputElement>(null);

    function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files.length > 0) {
            enqueueUploads(e.target.files);
        }
        // Reset so the same file can be re-selected.
        e.target.value = '';
    }

    function create(kind: 'new-word' | 'new-powerpoint' | 'new-excel' | 'new-folder' | 'new-file') {
        const operation = kind === 'new-folder' ? 'drive.createFolder' : 'drive.createFile';
        if (!requireOperation(operation)) { return; }
        openModal({ kind });
    }

    return (
        <div
            data-testid="empty-folder-onboarding"
            onClick={e => e.stopPropagation()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 10,
                padding: '0 24px',
                textAlign: 'center',
            }}
        >
            <input
                ref={fileInputRef}
                type="file"
                multiple
                data-testid="empty-folder-upload-input"
                style={{ display: 'none' }}
                onChange={handleFilesSelected}
            />
            <span className="codicon codicon-cloud-upload" style={{ fontSize: 48, opacity: 0.55 }} />
            <span style={{ fontSize: 13, fontWeight: 600 }} data-testid="filelist-empty">
                This folder is empty
            </span>
            <span style={{ fontSize: 12, opacity: 0.75, maxWidth: 420 }}>
                Drop in your first file, or create one without leaving the editor.
            </span>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                    type="button"
                    data-testid="empty-folder-upload"
                    onClick={() => {
                        if (!requireOperation('drive.uploadSmall')) { return; }
                        fileInputRef.current?.click();
                    }}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        fontSize: 13,
                        cursor: 'pointer',
                        border: 'none',
                        borderRadius: 2,
                        color: 'var(--vscode-button-foreground)',
                        backgroundColor: 'var(--vscode-button-background)',
                    }}
                >
                    <span className="codicon codicon-cloud-upload" />
                    Upload files
                </button>
                <button
                    type="button"
                    data-testid="empty-folder-new-folder"
                    onClick={() => create('new-folder')}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        fontSize: 13,
                        cursor: 'pointer',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: 2,
                        color: 'var(--vscode-button-secondaryForeground)',
                        backgroundColor: 'var(--vscode-button-secondaryBackground)',
                    }}
                >
                    <span className="codicon codicon-new-folder" />
                    New folder
                </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                <span>or start a</span>
                <QuickCreate testId="empty-folder-new-word" label="Word" letter="W" color="#2b579a" onClick={() => create('new-word')} />
                <QuickCreate testId="empty-folder-new-excel" label="Excel" letter="X" color="#217346" onClick={() => create('new-excel')} />
                <QuickCreate testId="empty-folder-new-powerpoint" label="PowerPoint" letter="P" color="#d24726" onClick={() => create('new-powerpoint')} />
            </div>
        </div>
    );
}

/** A one-click "create this kind of document" chip for the empty-folder invitation. */
function QuickCreate({
    testId, label, letter, color, onClick,
}: {
    testId: string; label: string; letter: string; color: string; onClick: () => void;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            title={`New ${label} document`}
            onClick={onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 9px',
                fontSize: 12,
                cursor: 'pointer',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: 12,
                color: 'var(--vscode-foreground)',
                backgroundColor: 'transparent',
            }}
        >
            <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: 3,
                fontSize: 10, fontWeight: 700, color: '#fff',
                backgroundColor: color, flexShrink: 0, lineHeight: 1,
            }}>
                {letter}
            </span>
            {label}
        </button>
    );
}

/** The single "fix this" affordance shared by the permission-blocked empty states. */
function GrantPermissionsButton({ testId }: { testId: string }) {
    const { grantPermissions, isGrantingPermissions } = useStorageExplorer();
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={grantPermissions}
            disabled={isGrantingPermissions}
            style={{
                padding: '4px 14px',
                fontSize: 12,
                cursor: isGrantingPermissions ? 'default' : 'pointer',
                color: 'var(--vscode-button-foreground)',
                backgroundColor: 'var(--vscode-button-background)',
                border: 'none',
                borderRadius: 2,
            }}
        >
            {isGrantingPermissions ? 'Granting…' : 'Grant permissions'}
        </button>
    );
}

/** Onboarding state for a ready container type that has no containers yet. */
function FirstContainerState({
    onCreate,
    permissionMessage,
}: {
    onCreate: () => void;
    permissionMessage: string | null;
}) {
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
                aria-disabled={!!permissionMessage}
                title={permissionMessage ?? 'Create your first container'}
                style={{
                    padding: '6px 14px',
                    fontSize: 13,
                    cursor: permissionMessage ? 'not-allowed' : 'pointer',
                    opacity: permissionMessage ? 0.45 : 1,
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
