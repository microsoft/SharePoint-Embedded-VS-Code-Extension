import React, { useRef, useState, useEffect } from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { openUrl } from '../../utils/openUrl';

export function ActionBar() {
    const { path, selectedItem } = useStorageExplorer();
    const atRoot = path.length === 1;
    const isFile = selectedItem?.kind === 'file';
    const hasSelection = selectedItem !== null;
    // Open in web: only Office files carry a webUrl
    const canOpen     = isFile && !!selectedItem?.webUrl;
    const canPreview  = isFile;   // preview is fetched on demand via POST /preview
    const canDownload = isFile;

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
            {atRoot ? (
                <ContainerActions hasSelection={hasSelection} />
            ) : (
                <FileActions
                    hasSelection={hasSelection} isFile={isFile}
                    canOpen={canOpen} canPreview={canPreview} canDownload={canDownload}
                />
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
    icon, label, title, disabled, danger, onClick,
}: {
    icon: string; label: string; title: string;
    disabled?: boolean; danger?: boolean; onClick: () => void;
}) {
    return (
        <button
            className="action-btn"
            title={title}
            disabled={disabled}
            onClick={onClick}
            style={danger && !disabled ? { color: 'var(--vscode-errorForeground)' } : undefined}
        >
            <span className={`codicon ${icon}`} />
            {label}
        </button>
    );
}

function ContainerActions({ hasSelection }: { hasSelection: boolean }) {
    const { selectedItem, openModal, navigateToDeletedContainers } = useStorageExplorer();
    return (
        <>
            <ActionBtn icon="codicon-add" label="New Container" title="Create a new container" onClick={() => openModal({ kind: 'new-container' })} />
            <ActionBtn icon="codicon-trash" label="Deleted containers" title="View deleted containers" onClick={navigateToDeletedContainers} />
            <Separator />
            <ActionBtn icon="codicon-edit" label="Rename" title="Rename selected container" disabled={!hasSelection} onClick={() => selectedItem && openModal({ kind: 'rename', item: selectedItem })} />
            <ActionBtn icon="codicon-trash" label="Delete" title="Delete selected container" disabled={!hasSelection} danger onClick={() => selectedItem && openModal({ kind: 'delete', item: selectedItem })} />
        </>
    );
}

function FileActions({
    hasSelection, isFile, canOpen, canPreview, canDownload,
}: {
    hasSelection: boolean; isFile: boolean;
    canOpen: boolean; canPreview: boolean; canDownload: boolean;
}) {
    const { selectedItem, openModal, enqueueUploads, previewItem, downloadItem, openInDesktopApp } = useStorageExplorer();
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                style={{ display: 'none' }}
                onChange={handleFilesSelected}
            />
            <NewDropdown />
            <ActionBtn icon="codicon-cloud-upload" label="Upload" title="Upload files" onClick={() => fileInputRef.current?.click()} />
            <Separator />
            <OpenDropdown
                disabled={!canOpen}
                onOpenInWeb={() => selectedItem?.webUrl && openUrl(selectedItem.webUrl)}
                onOpenInDesktop={() => selectedItem && openInDesktopApp(selectedItem)}
            />
            <ActionBtn icon="codicon-eye" label="Preview" title="Preview selected file" disabled={!canPreview} onClick={() => selectedItem && previewItem(selectedItem)} />
            <ActionBtn icon="codicon-edit" label="Rename" title="Rename selected item" disabled={!hasSelection} onClick={() => selectedItem && openModal({ kind: 'rename', item: selectedItem })} />
            <ActionBtn icon="codicon-trash" label="Delete" title="Delete selected item" disabled={!hasSelection} danger onClick={() => selectedItem && openModal({ kind: 'delete', item: selectedItem })} />
            <ActionBtn icon="codicon-cloud-download" label="Download" title="Download selected file" disabled={!canDownload} onClick={() => selectedItem && downloadItem(selectedItem)} />
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
                    <button className="menu-item" onClick={() => pick('new-word')}>
                        <OfficeBadge letter="W" color="#2C5696" />
                        New Word document
                    </button>
                    <button className="menu-item" onClick={() => pick('new-powerpoint')}>
                        <OfficeBadge letter="P" color="#B7472A" />
                        New PowerPoint presentation
                    </button>
                    <button className="menu-item" onClick={() => pick('new-excel')}>
                        <OfficeBadge letter="X" color="#1F6B42" />
                        New Excel workbook
                    </button>
                    <div style={{ height: 1, backgroundColor: 'var(--vscode-menu-separatorBackground, var(--vscode-panel-border))', margin: '4px 0' }} />
                    <button className="menu-item" onClick={() => pick('new-folder')}>
                        <span className="codicon codicon-new-folder" />
                        New Folder
                    </button>
                    <button className="menu-item" onClick={() => pick('new-file')}>
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
                    <button className="menu-item" onClick={() => { setOpen(false); onOpenInWeb(); }}>
                        <span className="codicon codicon-globe" />
                        Open in browser
                    </button>
                    <button className="menu-item" onClick={() => { setOpen(false); onOpenInDesktop(); }}>
                        <span className="codicon codicon-desktop-download" />
                        Open in desktop
                    </button>
                </div>
            )}
        </div>
    );
}
