import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { DEFAULT_RETENTION_DAYS } from '../../data/dummyData';

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

export function RecycledActionBar() {
    const { selectedItem, viewMode, openModal, retentionOverrides, restoreContainer } = useStorageExplorer();
    const hasSelection = selectedItem !== null;
    const isContainerRecycleBin = viewMode.kind === 'container-recycle-bin';

    function openSettings() {
        if (viewMode.kind !== 'container-recycle-bin') return;
        const currentDays = retentionOverrides[viewMode.containerId] ?? null;
        openModal({ kind: 'retention-settings', containerId: viewMode.containerId, currentDays });
    }

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
            {isContainerRecycleBin && (
                <>
                    <ActionBtn
                        icon="codicon-settings-gear"
                        label="Settings"
                        title="Configure recycle bin retention period"
                        onClick={openSettings}
                    />
                    <Separator />
                </>
            )}
            <ActionBtn
                icon="codicon-redo"
                label="Restore"
                title="Restore selected item"
                disabled={!hasSelection}
                onClick={() => selectedItem && restoreContainer(selectedItem.id).catch(console.error)}
            />
            <ActionBtn
                icon="codicon-trash"
                label="Permanently delete"
                title="Permanently delete selected item"
                disabled={!hasSelection}
                danger
                onClick={() => selectedItem && openModal({ kind: 'permanently-delete', item: selectedItem })}
            />
        </div>
    );
}
