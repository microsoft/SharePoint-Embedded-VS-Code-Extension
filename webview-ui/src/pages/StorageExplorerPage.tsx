import React, { useEffect, useRef, useState } from 'react';
import { NavBar } from '../components/NavBar/NavBar';
import { ActionBar } from '../components/ActionBar/ActionBar';
import { FileList } from '../components/FileList/FileList';
import { RecycledList } from '../components/RecycledList/RecycledList';
import { RecycledActionBar } from '../components/RecycledList/RecycledActionBar';
import { SidePanel } from '../components/SidePanel/SidePanel';
import { Modal } from '../components/Modal/Modal';
import { useStorageExplorer } from '../context/StorageExplorerContext';
import { DEFAULT_RETENTION_DAYS } from '../data/dummyData';

export function StorageExplorerPage() {
    const { sidePanelOpen, modal, closeModal, viewMode, setRetentionOverride } = useStorageExplorer();
    const isRecycledView = viewMode.kind !== 'normal';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <NavBar />
            {isRecycledView ? <RecycledActionBar /> : <ActionBar />}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {isRecycledView ? <RecycledList /> : <FileList />}
                {sidePanelOpen && <SidePanel />}
            </div>
            {modal?.kind === 'rename' && (
                <RenameModal
                    currentName={modal.item.name}
                    onConfirm={(newName) => { closeModal(); /* TODO: rename(modal.item, newName) */ }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'delete' && (
                <DeleteModal
                    itemName={modal.item.name}
                    onConfirm={() => { closeModal(); /* TODO: delete(modal.item) */ }}
                    onCancel={closeModal}
                />
            )}
            {modal?.kind === 'permanently-delete' && (
                <PermanentlyDeleteModal
                    itemName={modal.item.name}
                    onConfirm={() => { closeModal(); /* TODO: permanentlyDelete(modal.item) */ }}
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
        </div>
    );
}

function RenameModal({
    currentName, onConfirm, onCancel,
}: {
    currentName: string;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(currentName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.select();
    }, []);

    function handleConfirm() {
        const trimmed = value.trim();
        if (trimmed && trimmed !== currentName) {
            onConfirm(trimmed);
        } else {
            onCancel();
        }
    }

    return (
        <Modal
            title="Rename"
            confirmLabel="Rename"
            confirmDisabled={!value.trim() || value.trim() === currentName}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
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
        </Modal>
    );
}

function DeleteModal({
    itemName, onConfirm, onCancel,
}: {
    itemName: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal
            title="Delete"
            confirmLabel="Delete"
            danger
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <p style={{ margin: 0, color: 'var(--vscode-foreground)', fontSize: 13, lineHeight: '1.5' }}>
                Are you sure you want to delete <strong>"{itemName}"</strong>?
            </p>
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
    const [useDefault, setUseDefault] = useState(currentDays === null);
    const [inputValue, setInputValue] = useState(currentDays !== null ? String(currentDays) : String(DEFAULT_RETENTION_DAYS));

    const parsedDays = parseInt(inputValue, 10);
    const isValidRange = !isNaN(parsedDays) && parsedDays >= 7 && parsedDays <= 180;
    const confirmDisabled = !useDefault && !isValidRange;

    function handleConfirm() {
        onConfirm(useDefault ? null : parsedDays);
    }

    return (
        <Modal
            title="Recycle bin settings"
            confirmLabel="Save"
            confirmDisabled={confirmDisabled}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--vscode-foreground)', opacity: 0.8, lineHeight: '1.5' }}>
                    Override the number of days deleted files and folders are retained before permanent deletion.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={useDefault}
                        onChange={e => setUseDefault(e.target.checked)}
                    />
                    Use default ({DEFAULT_RETENTION_DAYS} days)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Retention period (days):</label>
                    <input
                        type="number"
                        min={7}
                        max={180}
                        value={inputValue}
                        disabled={useDefault}
                        onChange={e => setInputValue(e.target.value)}
                        style={{
                            width: 72,
                            padding: '4px 6px',
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: `1px solid ${!useDefault && !isValidRange ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border, var(--vscode-panel-border))'}`,
                            borderRadius: 3,
                            fontSize: 13,
                            opacity: useDefault ? 0.5 : 1,
                        }}
                    />
                    <span style={{ fontSize: 12, opacity: 0.6 }}>7–180</span>
                </div>
            </div>
        </Modal>
    );
}
