import React, { useEffect, useRef, useState } from 'react';
import { NavBar } from '../components/NavBar/NavBar';
import { ActionBar } from '../components/ActionBar/ActionBar';
import { FileList } from '../components/FileList/FileList';
import { RecycledList } from '../components/RecycledList/RecycledList';
import { RecycledActionBar } from '../components/RecycledList/RecycledActionBar';
import { SidePanel } from '../components/SidePanel/SidePanel';
import { NetworkDrawer } from '../components/NetworkDrawer/NetworkDrawer';
import { UploadCard } from '../components/UploadCard/UploadCard';
import { Modal } from '../components/Modal/Modal';
import { useStorageExplorer } from '../context/StorageExplorerContext';
import { DEFAULT_RETENTION_DAYS } from '../data/dummyData';

export function StorageExplorerPage() {
    const { sidePanelOpen, modal, closeModal, viewMode, setRetentionOverride, networkDrawerOpen, createContainer, renameContainer, deleteContainer, permanentlyDeleteContainer } = useStorageExplorer();
    const isRecycledView = viewMode.kind !== 'normal';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <NavBar />
            {isRecycledView ? <RecycledActionBar /> : <ActionBar />}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                    {isRecycledView ? <RecycledList /> : <FileList />}
                    {sidePanelOpen && <SidePanel />}
                </div>
                {networkDrawerOpen && <NetworkDrawer />}
            </div>
            <UploadCard />
            {modal?.kind === 'new-container' && (
                <NewContainerModal
                    onConfirm={async (name, description) => {
                        await createContainer(name, description);
                        closeModal();
                    }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'rename' && (
                <RenameModal
                    currentName={modal.item.name}
                    onConfirm={async (newName) => {
                        await renameContainer(modal.item.id, newName);
                        closeModal();
                    }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'delete' && (
                <DeleteModal
                    itemName={modal.item.name}
                    onConfirm={async () => {
                        await deleteContainer(modal.item.id);
                        closeModal();
                    }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'permanently-delete' && (
                <PermanentlyDeleteModal
                    itemName={modal.item.name}
                    onConfirm={async () => {
                        await permanentlyDeleteContainer(modal.item.id);
                        closeModal();
                    }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'retention-settings' && (
                <RetentionSettingsModal
                    containerId={modal.containerId}
                    currentDays={modal.currentDays}
                    onConfirm={(days) => { setRetentionOverride(modal.containerId, days); closeModal(); }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'new-word' && (
                <NewItemModal
                    title="New Word document"
                    description="Enter a name for the document. The .docx extension will be added automatically."
                    placeholder="Document name"
                    extension=".docx"
                    onConfirm={() => closeModal()}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'new-powerpoint' && (
                <NewItemModal
                    title="New PowerPoint presentation"
                    description="Enter a name for the presentation. The .pptx extension will be added automatically."
                    placeholder="Presentation name"
                    extension=".pptx"
                    onConfirm={() => closeModal()}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'new-excel' && (
                <NewItemModal
                    title="New Excel workbook"
                    description="Enter a name for the workbook. The .xlsx extension will be added automatically."
                    placeholder="Workbook name"
                    extension=".xlsx"
                    onConfirm={() => closeModal()}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'new-folder' && (
                <NewItemModal
                    title="New folder"
                    description="Enter a name for the new folder."
                    placeholder="Folder name"
                    onConfirm={() => closeModal()}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'new-file' && (
                <NewItemModal
                    title="New file"
                    description="Enter a name for the new file, including its extension (e.g. report.pdf, notes.txt)."
                    placeholder="filename.ext"
                    onConfirm={() => closeModal()}
                    onCancel={closeModal}
                />
            )}
        </div>
    );
}

function RenameModal({
    currentName, onConfirm, onCancel,
}: {
    currentName: string;
    onConfirm: (name: string) => Promise<void>;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(currentName);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.select();
    }, []);

    async function handleConfirm() {
        const trimmed = value.trim();
        if (!trimmed || trimmed === currentName) { onCancel(); return; }
        setBusy(true);
        setError(null);
        try {
            await onConfirm(trimmed);
        } catch (err: any) {
            setError(err?.message ?? 'Rename failed.');
            setBusy(false);
        }
    }

    return (
        <Modal
            title="Rename"
            confirmLabel={busy ? 'Renaming…' : 'Rename'}
            confirmDisabled={!value.trim() || value.trim() === currentName || busy}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{error}</p>}
                <input
                    ref={inputRef}
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '5px 8px',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                        borderRadius: 3,
                        fontSize: 13,
                        outline: 'none',
                    }}
                />
            </div>
        </Modal>
    );
}

function DeleteModal({
    itemName, onConfirm, onCancel,
}: {
    itemName: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleConfirm() {
        setBusy(true);
        setError(null);
        try {
            await onConfirm();
        } catch (err: any) {
            setError(err?.message ?? 'Delete failed.');
            setBusy(false);
        }
    }

    return (
        <Modal
            title="Delete"
            confirmLabel={busy ? 'Deleting…' : 'Delete'}
            confirmDisabled={busy}
            danger
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{error}</p>}
                <p style={{ margin: 0, color: 'var(--vscode-foreground)', fontSize: 13, lineHeight: '1.5' }}>
                    Are you sure you want to delete <strong>"{itemName}"</strong>?
                </p>
            </div>
        </Modal>
    );
}

function PermanentlyDeleteModal({
    itemName, onConfirm, onCancel,
}: {
    itemName: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal
            title="Permanently delete"
            confirmLabel="Permanently delete"
            danger
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <p style={{ margin: 0, color: 'var(--vscode-foreground)', fontSize: 13, lineHeight: '1.5' }}>
                Are you sure you want to permanently delete <strong>"{itemName}"</strong>? This cannot be undone.
            </p>
        </Modal>
    );
}

function RetentionSettingsModal({
    containerId, currentDays, onConfirm, onCancel,
}: {
    containerId: string;
    currentDays: number | null;
    onConfirm: (days: number | null) => void;
    onCancel: () => void;
}) {
    const initialValue = currentDays !== null ? String(currentDays) : String(DEFAULT_RETENTION_DAYS);
    const [inputValue, setInputValue] = useState(initialValue);

    const parsedDays = parseInt(inputValue, 10);
    const isInteger = /^\d+$/.test(inputValue.trim());
    const isValidRange = isInteger && parsedDays >= 7 && parsedDays <= 180;
    const isDefault = parsedDays === DEFAULT_RETENTION_DAYS;

    function handleConfirm() {
        onConfirm(isDefault ? null : parsedDays);
    }

    return (
        <Modal
            title="Recycle bin settings"
            confirmLabel="Save"
            confirmDisabled={!isValidRange}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--vscode-foreground)', opacity: 0.8, lineHeight: '1.5' }}>
                    Override the number of days deleted files and folders are retained before permanent deletion.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label htmlFor="retention-days" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                            Retention period (days):
                        </label>
                        <input
                            id="retention-days"
                            type="text"
                            inputMode="numeric"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            style={{
                                width: 64,
                                padding: '4px 6px',
                                background: 'var(--vscode-input-background)',
                                color: 'var(--vscode-input-foreground)',
                                border: `1px solid ${inputValue && !isValidRange ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border, var(--vscode-panel-border))'}`,
                                borderRadius: 3,
                                fontSize: 13,
                                MozAppearance: 'textfield',
                            } as React.CSSProperties}
                        />
                        {!isDefault && (
                            <button
                                className="action-btn"
                                title={`Reset to default (${DEFAULT_RETENTION_DAYS} days)`}
                                onClick={() => setInputValue(String(DEFAULT_RETENTION_DAYS))}
                            >
                                Reset to default
                            </button>
                        )}
                    </div>
                    {inputValue && !isValidRange ? (
                        <span style={{ fontSize: 12, color: 'var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground))' }}>
                            Must be a whole number between 7 and 180.
                        </span>
                    ) : (
                        <span style={{ fontSize: 12, opacity: 0.6 }}>
                            Valid range is 7 to 180 days. The default is {DEFAULT_RETENTION_DAYS} days.
                        </span>
                    )}
                </div>
            </div>
        </Modal>
    );
}

// ── New container modal ───────────────────────────────────────────────────────

function NewContainerModal({
    onConfirm, onCancel,
}: {
    onConfirm: (name: string, description: string) => Promise<void>;
    onCancel: () => void;
}) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleConfirm() {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        setBusy(true);
        setError(null);
        try {
            await onConfirm(trimmedName, description.trim());
        } catch (err: any) {
            setError(err?.message ?? 'Failed to create container.');
            setBusy(false);
        }
    }

    return (
        <Modal
            title="New container"
            confirmLabel={busy ? 'Creating…' : 'Create'}
            confirmDisabled={!name.trim() || busy}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--vscode-foreground)', opacity: 0.75, lineHeight: '1.5' }}>
                    Containers are the top-level storage units in SharePoint Embedded. Each container has its own set of permissions, columns, and settings.
                </p>
                {error && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{error}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="container-name" style={{ fontSize: 12, opacity: 0.7 }}>
                        Name <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                    </label>
                    <input
                        id="container-name"
                        autoFocus
                        value={name}
                        placeholder="My container"
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) handleConfirm(); }}
                        style={INPUT_STYLE}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="container-description" style={{ fontSize: 12, opacity: 0.7 }}>
                        Description <span style={{ fontSize: 11, opacity: 0.6 }}>(optional)</span>
                    </label>
                    <textarea
                        id="container-description"
                        value={description}
                        rows={3}
                        placeholder="What is this container used for?"
                        onChange={e => setDescription(e.target.value)}
                        style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: '1.5' }}
                    />
                </div>
            </div>
        </Modal>
    );
}

// ── New item modal (shared by all five New… dialog types) ─────────────────────

const INPUT_STYLE: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '5px 8px',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
    borderRadius: 3,
    fontSize: 13,
    outline: 'none',
    fontFamily: 'var(--vscode-font-family)',
};

function NewItemModal({
    title, description, placeholder, extension, onConfirm, onCancel,
}: {
    title: string;
    description: string;
    placeholder: string;
    /** When provided, auto-appended and shown as a preview; prompt is for the base name only */
    extension?: string;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    function handleConfirm() {
        const trimmed = value.trim();
        if (!trimmed) return;
        onConfirm(extension ? `${trimmed}${extension}` : trimmed);
    }

    return (
        <Modal
            title={title}
            confirmLabel="Create"
            confirmDisabled={!value.trim()}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--vscode-foreground)', opacity: 0.75, lineHeight: '1.5' }}>
                    {description}
                </p>
                <div>
                    <input
                        ref={inputRef}
                        autoFocus
                        value={value}
                        placeholder={placeholder}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                        style={INPUT_STYLE}
                    />
                    {extension && value.trim() && (
                        <div style={{ marginTop: 5, fontSize: 12, opacity: 0.6 }}>
                            Will be created as: <strong>{value.trim()}{extension}</strong>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
