import React, { useRef, useState, useEffect } from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { isOfficeFile } from '../FileList/fileListUtils';

export function ActionBar() {
    const { path, selectedItem } = useStorageExplorer();
    const atRoot = path.length === 1;
    const isFile = selectedItem?.kind === 'file';
    const hasSelection = selectedItem !== null;
    const canOpen = isFile && !!selectedItem && isOfficeFile(selectedItem);

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
                <FileActions hasSelection={hasSelection} isFile={isFile} canOpen={canOpen} />
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
            <ActionBtn icon="codicon-add" label="New Container" title="Create a new container" onClick={() => { /* TODO */ }} />
            <ActionBtn icon="codicon-trash" label="Deleted containers" title="View deleted containers" onClick={navigateToDeletedContainers} />
            <Separator />
            <ActionBtn icon="codicon-edit" label="Rename" title="Rename selected container" disabled={!hasSelection} onClick={() => selectedItem && openModal({ kind: 'rename', item: selectedItem })} />
            <ActionBtn icon="codicon-trash" label="Delete" title="Delete selected container" disabled={!hasSelection} danger onClick={() => selectedItem && openModal({ kind: 'delete', item: selectedItem })} />
        </>
    );
}

function FileActions({
    hasSelection, isFile, canOpen,
}: {
    hasSelection: boolean; isFile: boolean; canOpen: boolean;
}) {
    const { selectedItem, openModal } = useStorageExplorer();
    return (
        <>
            <ActionBtn icon="codicon-new-folder" label="New Folder" title="Create a new folder" onClick={() => { /* TODO */ }} />
            <ActionBtn icon="codicon-file-add" label="New File" title="Create a new empty file" onClick={() => { /* TODO */ }} />
            <ActionBtn icon="codicon-cloud-upload" label="Upload" title="Upload files" onClick={() => { /* TODO */ }} />
            <Separator />
            <OpenDropdown disabled={!canOpen} />
            <ActionBtn icon="codicon-eye" label="Preview" title="Preview selected file" disabled={!isFile} onClick={() => { /* TODO */ }} />
            <ActionBtn icon="codicon-edit" label="Rename" title="Rename selected item" disabled={!hasSelection} onClick={() => selectedItem && openModal({ kind: 'rename', item: selectedItem })} />
            <ActionBtn icon="codicon-trash" label="Delete" title="Delete selected item" disabled={!hasSelection} danger onClick={() => selectedItem && openModal({ kind: 'delete', item: selectedItem })} />
            <ActionBtn icon="codicon-cloud-download" label="Download" title="Download selected file" disabled={!isFile} onClick={() => { /* TODO */ }} />
        </>
    );
}

function OpenDropdown({ disabled }: { disabled: boolean }) {
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
                    <button className="menu-item" onClick={() => { setOpen(false); /* TODO */ }}>
                        <span className="codicon codicon-globe" />
                        Open in web browser
                    </button>
                    <button className="menu-item" onClick={() => { setOpen(false); /* TODO */ }}>
                        <span className="codicon codicon-desktop-download" />
                        Open in desktop app
                    </button>
                </div>
            )}
        </div>
    );
}
