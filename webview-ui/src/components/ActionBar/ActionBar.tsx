import React, { useRef, useState, useEffect } from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { openUrl } from '../../utils/openUrl';
import { Modal } from '../Modal/Modal';

export function ActionBar() {
    const { path, currentItems, selectedItem, selectedIds, activateContainer, deleteSelected, clearSelected, deleteProgress, cancelDelete } = useStorageExplorer();
    const atRoot = path.length === 1;
    const isFile = selectedItem?.kind === 'file';
    const hasSelection = selectedItem !== null;
    // Open in web: only Office files carry a webUrl
    const canOpen     = isFile && !!selectedItem?.webUrl;
    const canPreview  = isFile;   // preview is fetched on demand via POST /preview
    const canDownload = isFile;

    const selectedCount = selectedIds.size;
    const checkedInactiveContainer = atRoot && selectedCount === 1
        ? currentItems.find(item =>
            selectedIds.has(item.id)
            && item.kind === 'container'
            && item.status === 'inactive'
        )
        : undefined;
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: '4px 8px',
                borderBottom: '1px solid var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-editor-background)',
                flexShrink: 0,
            }}
        >
            {selectedCount > 0 && (
                <>
                    <span data-testid="selection-count" style={{ fontSize: 12, opacity: 0.8, padding: '0 6px', whiteSpace: 'nowrap' }}>
                        {selectedCount} selected
                    </span>
                    {checkedInactiveContainer && (
                        <ActionBtn
                            icon="codicon-play"
                            label="Activate"
                            title="Activate selected container"
                            testId="bulk-activate-container"
                            onClick={async () => {
                                await activateContainer(checkedInactiveContainer.id);
                                clearSelected();
                            }}
                        />
                    )}
                    <ActionBtn icon="codicon-trash" label={`Delete (${selectedCount})`} title="Delete selected items" testId="bulk-delete" danger onClick={() => setConfirmBulk(true)} />
                    <ActionBtn icon="codicon-close" label="Clear" title="Clear selection" testId="bulk-clear" onClick={clearSelected} />
                    <Separator />
                </>
            )}
            {selectedCount === 0 && (
                atRoot ? (
                    <ContainerActions hasSelection={hasSelection} />
                ) : (
                    <FileActions
                        hasSelection={hasSelection} isFile={isFile}
                        canOpen={canOpen} canPreview={canPreview} canDownload={canDownload}
                    />
                )
            )}
            {confirmBulk && (
                <Modal
                    title={`Delete ${selectedCount} item${selectedCount === 1 ? '' : 's'}?`}
                    confirmLabel={deleteProgress ? `Deleting ${deleteProgress.current}/${deleteProgress.total}…` : 'Delete'}
                    cancelLabel={bulkBusy ? (cancelling ? 'Cancelling…' : 'Cancel remaining') : 'Cancel'}
                    danger
                    confirmDisabled={bulkBusy}
                    onConfirm={async () => {
                        setBulkBusy(true);
                        setCancelling(false);
                        try {
                            await deleteSelected();
                        } finally {
                            setBulkBusy(false);
                            setCancelling(false);
                            setConfirmBulk(false);
                        }
                    }}
                    onCancel={() => {
                        if (bulkBusy) {
                            // A delete is running — abort the remaining items (the in-flight one still finishes).
                            setCancelling(true);
                            cancelDelete();
                        } else {
                            setConfirmBulk(false);
                        }
                    }}
                >
                    {deleteProgress ? (
                        <p data-testid="delete-progress" style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="codicon codicon-loading codicon-modifier-spin" />
                            {cancelling
                                ? `Cancelling… (${deleteProgress.current} of ${deleteProgress.total} deleted)`
                                : `Deleting ${deleteProgress.current} of ${deleteProgress.total}…`}
                        </p>
                    ) : (
                        <p style={{ margin: 0, fontSize: 13, lineHeight: '1.5' }}>
                            This will delete the {selectedCount} selected item{selectedCount === 1 ? '' : 's'}. This action cannot be undone from here.
                        </p>
                    )}
                </Modal>
            )}
        </div>
    );
}

function Separator() {
    return (
        <div style={{ width: 1, height: 18, backgroundColor: 'var(--vscode-panel-border)', margin: '0 4px', flexShrink: 0 }} />
    );
}

function ActionBtn({
    icon, label, title, disabled, danger, onClick, testId,
}: {
    icon: string; label: string; title: string;
    disabled?: boolean; danger?: boolean; onClick: () => void; testId?: string;
}) {
    return (
        <button
            className="action-btn"
            title={title}
            disabled={disabled}
            onClick={onClick}
            data-testid={testId}
            style={danger && !disabled ? { color: 'var(--vscode-errorForeground)' } : undefined}
        >
            <span className={`codicon ${icon}`} />
            {label}
        </button>
    );
}

function ContainerActions({ hasSelection }: { hasSelection: boolean }) {
    const { selectedItem, activateContainer, openModal, navigateToDeletedContainers } = useStorageExplorer();
    const canActivate = selectedItem?.kind === 'container' && selectedItem.status === 'inactive';
    return (
        <>
            <ActionBtn icon="codicon-add" label="New Container" title="Create a new container" testId="action-new-container" onClick={() => openModal({ kind: 'new-container' })} />
            <ActionBtn icon="codicon-trash" label="Deleted containers" title="View deleted containers" testId="action-deleted-containers" onClick={navigateToDeletedContainers} />
            <Separator />
            {canActivate && (
                <ActionBtn icon="codicon-play" label="Activate" title="Activate selected container" testId="action-activate-container" onClick={() => activateContainer(selectedItem.id)} />
            )}
            <ActionBtn icon="codicon-edit" label="Rename" title="Rename selected container" testId="action-rename-container" disabled={!hasSelection} onClick={() => selectedItem && openModal({ kind: 'rename', item: selectedItem })} />
            <ActionBtn icon="codicon-trash" label="Delete" title="Delete selected container" testId="action-delete-container" disabled={!hasSelection} danger onClick={() => selectedItem && openModal({ kind: 'delete', item: selectedItem })} />
        </>
    );
}

function FileActions({
    hasSelection, isFile, canOpen, canPreview, canDownload,
}: {
    hasSelection: boolean; isFile: boolean;
    canOpen: boolean; canPreview: boolean; canDownload: boolean;
}) {
    const { path, selectedItem, openModal, enqueueUploads, previewItem, downloadItem, openInDesktopApp, navigateToContainerRecycleBin } = useStorageExplorer();
    const fileInputRef = useRef<HTMLInputElement>(null);
    // The recycle bin is scoped to the container, not the folder we happen to be in, so it
    // always comes from path[1] — the entry directly under the root.
    const container = path[1];

    function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files.length > 0) {
            enqueueUploads(e.target.files);
        }
        // Reset so the same file can be re-selected
        e.target.value = '';
    }

    return (
        <>
            {/* Hidden native file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                data-testid="action-upload-input"
                style={{ display: 'none' }}
                onChange={handleFilesSelected}
            />
            <NewDropdown />
            <ActionBtn icon="codicon-cloud-upload" label="Upload" title="Upload files" testId="action-upload" onClick={() => fileInputRef.current?.click()} />
            {container && (
                <ActionBtn
                    // Not `codicon-trash`: Delete sits a few buttons away and already uses it.
                    // Two trash cans in one toolbar is the ambiguity this button is meant to remove.
                    icon="codicon-archive"
                    label="Recycle bin"
                    title="View this container's recycle bin"
                    testId="action-recycle-bin"
                    onClick={() => navigateToContainerRecycleBin(container.id, container.label)}
                />
            )}
            <Separator />
            <OpenDropdown
                disabled={!canOpen}
                onOpenInWeb={() => selectedItem?.webUrl && openUrl(selectedItem.webUrl)}
                onOpenInDesktop={() => selectedItem && openInDesktopApp(selectedItem)}
            />
            <ActionBtn icon="codicon-eye" label="Preview" title="Preview selected file" testId="action-preview" disabled={!canPreview} onClick={() => selectedItem && previewItem(selectedItem)} />
            <ActionBtn icon="codicon-edit" label="Rename" title="Rename selected item" testId="action-rename-item" disabled={!hasSelection} onClick={() => selectedItem && openModal({ kind: 'rename', item: selectedItem })} />
            <ActionBtn icon="codicon-trash" label="Delete" title="Delete selected item" testId="action-delete-item" disabled={!hasSelection} danger onClick={() => selectedItem && openModal({ kind: 'delete', item: selectedItem })} />
            <ActionBtn icon="codicon-cloud-download" label="Download" title="Download selected file" testId="action-download" disabled={!canDownload} onClick={() => selectedItem && downloadItem(selectedItem)} />
        </>
    );
}

// ── Office letter badge ─────────────────────────────────────────────────────

function OfficeBadge({ letter, color }: { letter: string; color: string }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: 3,
            fontSize: 11, fontWeight: 700, color: '#fff',
            backgroundColor: color, flexShrink: 0, lineHeight: 1,
        }}>
            {letter}
        </span>
    );
}

// ── + New dropdown ───────────────────────────────────────────────────────────

function NewDropdown() {
    const { openModal } = useStorageExplorer();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onMouseDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    function pick(kind: 'new-word' | 'new-powerpoint' | 'new-excel' | 'new-folder' | 'new-file') {
        setOpen(false);
        openModal({ kind });
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                className="action-btn"
                title="Create a new item"
                data-testid="action-new-dropdown"
                onClick={() => setOpen(o => !o)}
            >
                <span className="codicon codicon-add" />
                New
                <span className="codicon codicon-chevron-down" style={{ fontSize: 11, marginLeft: 2 }} />
            </button>

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 2px)',
                        left: 0,
                        minWidth: 220,
                        backgroundColor: 'var(--vscode-menu-background)',
                        border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
                        borderRadius: 4,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        zIndex: 9999,
                        padding: '4px 0',
                    }}
                >
                    <button className="menu-item" data-testid="action-new-word" onClick={() => pick('new-word')}>
                        <OfficeBadge letter="W" color="#2C5696" />
                        New Word document
                    </button>
                    <button className="menu-item" data-testid="action-new-powerpoint" onClick={() => pick('new-powerpoint')}>
                        <OfficeBadge letter="P" color="#B7472A" />
                        New PowerPoint presentation
                    </button>
                    <button className="menu-item" data-testid="action-new-excel" onClick={() => pick('new-excel')}>
                        <OfficeBadge letter="X" color="#1F6B42" />
                        New Excel workbook
                    </button>
                    <div style={{ height: 1, backgroundColor: 'var(--vscode-menu-separatorBackground, var(--vscode-panel-border))', margin: '4px 0' }} />
                    <button className="menu-item" data-testid="action-new-folder" onClick={() => pick('new-folder')}>
                        <span className="codicon codicon-new-folder" />
                        New Folder
                    </button>
                    <button className="menu-item" data-testid="action-new-file" onClick={() => pick('new-file')}>
                        <span className="codicon codicon-file-add" />
                        New File
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Open dropdown ────────────────────────────────────────────────────────────

function OpenDropdown({ disabled, onOpenInWeb, onOpenInDesktop }: { disabled: boolean; onOpenInWeb: () => void; onOpenInDesktop: () => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onMouseDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                className="action-btn"
                disabled={disabled}
                title="Open Office file"
                data-testid="action-open-dropdown"
                onClick={() => !disabled && setOpen(o => !o)}
            >
                <span className="codicon codicon-link-external" />
                Open
                <span className="codicon codicon-chevron-down" style={{ fontSize: 11, marginLeft: 2 }} />
            </button>

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 2px)',
                        left: 0,
                        minWidth: 200,
                        backgroundColor: 'var(--vscode-menu-background)',
                        border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
                        borderRadius: 4,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        zIndex: 9999,
                        padding: '4px 0',
                    }}
                >
                    <button className="menu-item" data-testid="action-open-web" onClick={() => { setOpen(false); onOpenInWeb(); }}>
                        <span className="codicon codicon-globe" />
                        Open in browser
                    </button>
                    <button className="menu-item" data-testid="action-open-desktop" onClick={() => { setOpen(false); onOpenInDesktop(); }}>
                        <span className="codicon codicon-desktop-download" />
                        Open in desktop
                    </button>
                </div>
            )}
        </div>
    );
}
