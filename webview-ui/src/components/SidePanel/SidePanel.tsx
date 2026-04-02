import React, { useEffect, useState } from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { SidePanelTab, StorageItem, ItemKind } from '../../models/StorageItem';
import { MetadataPanel } from './MetadataPanel';
import { FileMetadataPanel } from './FileMetadataPanel';
import { VersionsPanel } from './VersionsPanel';
import { PermissionsPanel } from './PermissionsPanel';
import { FilePermissionsPanel } from './FilePermissionsPanel';
import { ColumnsPanel } from './ColumnsPanel';
import { SettingsPanel } from './SettingsPanel';
import { getItemIcon, getItemIconColor } from '../FileList/fileListUtils';

const CONTAINER_TABS: { key: SidePanelTab; label: string; icon: string }[] = [
    { key: 'permissions', label: 'Permissions', icon: 'codicon-account' },
    { key: 'columns',     label: 'Columns',     icon: 'codicon-list-tree' },
    { key: 'metadata',    label: 'Metadata',    icon: 'codicon-tag' },
    { key: 'settings',    label: 'Settings',    icon: 'codicon-settings-gear' },
    { key: 'properties',  label: 'Properties',  icon: 'codicon-info' },
];

const FILE_TABS: { key: SidePanelTab; label: string; icon: string }[] = [
    { key: 'permissions', label: 'Permissions', icon: 'codicon-account' },
    { key: 'metadata',    label: 'Metadata',    icon: 'codicon-tag' },
    { key: 'versions',    label: 'Versions',    icon: 'codicon-history' },
    { key: 'properties',  label: 'Properties',  icon: 'codicon-info' },
];

const FOLDER_TABS: { key: SidePanelTab; label: string; icon: string }[] = [
    { key: 'permissions', label: 'Permissions', icon: 'codicon-account' },
    { key: 'metadata',    label: 'Metadata',    icon: 'codicon-tag' },
    { key: 'properties',  label: 'Properties',  icon: 'codicon-info' },
];

const RECYCLE_TABS: { key: SidePanelTab; label: string; icon: string }[] = [
    { key: 'properties', label: 'Properties', icon: 'codicon-info' },
];

function getTabsForKind(kind: ItemKind | undefined, isRecycledView: boolean) {
    if (isRecycledView) return RECYCLE_TABS;
    if (kind === 'container') return CONTAINER_TABS;
    if (kind === 'file') return FILE_TABS;
    return FOLDER_TABS;
}

export function SidePanel() {
    const { selectedItem, sidePanelTab, setSidePanelTab, toggleSidePanel, viewMode } = useStorageExplorer();
    const isRecycledView = viewMode.kind !== 'normal';

    const visibleTabs = getTabsForKind(selectedItem?.kind, isRecycledView);

    // Auto-switch to first valid tab when item kind changes
    useEffect(() => {
        if (!visibleTabs.find(t => t.key === sidePanelTab)) {
            setSidePanelTab(visibleTabs[0].key);
        }
    }, [selectedItem?.id, selectedItem?.kind, isRecycledView]); // eslint-disable-line

    return (
        <div
            style={{
                width: 320,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
                overflow: 'hidden',
            }}
        >
            {/* Panel header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px 0',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                    flexShrink: 0,
                    gap: 2,
                }}
            >
                {visibleTabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`tab-btn${sidePanelTab === tab.key ? ' active' : ''}`}
                        title={tab.label}
                        onClick={() => setSidePanelTab(tab.key)}
                    >
                        <span className={`codicon ${tab.icon}`} style={{ fontSize: 14 }} />
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button className="icon-btn" title="Close panel" style={{ fontSize: 14 }} onClick={toggleSidePanel}>
                    <span className="codicon codicon-close" />
                </button>
            </div>

            {/* Selected item summary */}
            {selectedItem && (
                <div
                    style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                    }}
                >
                    <span
                        className={`codicon ${getItemIcon(selectedItem)}`}
                        style={{ fontSize: 20, color: getItemIconColor(selectedItem), flexShrink: 0 }}
                    />
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedItem.name}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                            {selectedItem.type}{selectedItem.size ? ` · ${selectedItem.size}` : ''}
                        </div>
                    </div>
                </div>
            )}

            {/* Panel content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {sidePanelTab === 'properties'   && <PropertiesPanel item={selectedItem} />}
                {sidePanelTab === 'metadata'     && (
                    selectedItem?.kind === 'container'
                        ? <MetadataPanel item={selectedItem} />
                        : <FileMetadataPanel item={selectedItem} />
                )}
                {sidePanelTab === 'versions'     && <VersionsPanel item={selectedItem} />}
                {sidePanelTab === 'permissions'  && (
                    selectedItem?.kind === 'container'
                        ? <PermissionsPanel item={selectedItem} />
                        : <FilePermissionsPanel item={selectedItem} />
                )}
                {sidePanelTab === 'columns'      && <ColumnsPanel item={selectedItem} />}
                {sidePanelTab === 'settings'     && <SettingsPanel item={selectedItem} />}
            </div>
        </div>
    );
}

function PropertiesPanel({ item }: { item: StorageItem | null }) {
    const { viewMode } = useStorageExplorer();
    const isRecycledView = viewMode.kind !== 'normal';

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its properties.</p>;
    }

    if (item.kind === 'container' && !isRecycledView) {
        return <ContainerPropertiesPanel item={item} />;
    }

    // Simple read-only panel for files, folders, recycled items
    const rows = [
        { label: 'Name', value: item.name },
        { label: 'Type', value: item.type },
        { label: isRecycledView ? 'Deleted' : 'Modified', value: item.modifiedAt },
        ...(item.size ? [{ label: 'Size', value: item.size }] : []),
        ...(item.description ? [{ label: 'Description', value: item.description }] : []),
    ];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map(r => (
                <div key={r.label} style={{ padding: '5px 0', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 12, overflowWrap: 'break-word' }}>{r.value}</div>
                </div>
            ))}
        </div>
    );
}

// ── Container-specific rich properties panel ──────────────────────────────────

function ContainerPropertiesPanel({ item }: { item: StorageItem }) {
    const { api, refresh } = useStorageExplorer();

    // Fresh data fetched on mount / container change
    const [richItem, setRichItem] = useState<StorageItem>(item);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        setRichItem(item); // optimistic seed from list data
        setLoadError(null);
        api.containers.get(item.id).then(fresh => {
            if (fresh) setRichItem(fresh);
        }).catch((err: any) => {
            setLoadError(err?.message ?? 'Failed to load container details.');
        });
    }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Inline-edit state for name
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(item.name);
    const [nameBusy, setNameBusy] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);

    // Inline-edit state for description
    const [editingDesc, setEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState(item.description ?? '');
    const [descBusy, setDescBusy] = useState(false);
    const [descError, setDescError] = useState<string | null>(null);

    // Reset drafts when item changes
    useEffect(() => {
        setNameDraft(item.name);
        setDescDraft(item.description ?? '');
        setEditingName(false);
        setEditingDesc(false);
    }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

    async function saveName() {
        const trimmed = nameDraft.trim();
        if (!trimmed || trimmed === richItem.name) { setEditingName(false); return; }
        setNameBusy(true); setNameError(null);
        try {
            await api.containers.rename(richItem.id, trimmed);
            setEditingName(false);
            const fresh = await api.containers.get(richItem.id);
            if (fresh) setRichItem(fresh);
            await refresh();
        } catch (err: any) {
            setNameError(err?.message ?? 'Failed to rename.');
        } finally {
            setNameBusy(false);
        }
    }

    async function saveDescription() {
        const trimmed = descDraft.trim();
        if (trimmed === (richItem.description ?? '')) { setEditingDesc(false); return; }
        setDescBusy(true); setDescError(null);
        try {
            await api.containers.updateDescription(richItem.id, trimmed);
            setEditingDesc(false);
            const fresh = await api.containers.get(richItem.id);
            if (fresh) setRichItem(fresh);
            await refresh();
        } catch (err: any) {
            setDescError(err?.message ?? 'Failed to update description.');
        } finally {
            setDescBusy(false);
        }
    }

    const [copied, setCopied] = useState<string | null>(null);

    function copyToClipboard(key: string, text: string) {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1500);
        }).catch(() => {});
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '4px 7px', fontSize: 12, boxSizing: 'border-box',
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-focusBorder, var(--vscode-input-border))',
        borderRadius: 3, outline: 'none',
        fontFamily: 'var(--vscode-font-family)',
    };
    const rowStyle: React.CSSProperties = {
        padding: '6px 0', borderBottom: '1px solid var(--vscode-panel-border)',
    };
    const labelStyle: React.CSSProperties = {
        fontSize: 11, opacity: 0.6, marginBottom: 3,
    };

    // ── Status labels ─────────────────────────────────────────────────────────
    const hasLabels = richItem.sensitivityLabel?.displayName || richItem.lockState === 'lockedReadOnly' || richItem.status === 'inactive';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

            {loadError && (
                <div style={{ fontSize: 11, color: 'var(--vscode-errorForeground)', marginBottom: 8 }}>
                    <span className="codicon codicon-warning" style={{ marginRight: 4 }} />
                    {loadError}
                </div>
            )}

            {/* Status label bar */}
            {hasLabels && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 0 10px' }}>
                    {richItem.sensitivityLabel?.displayName && (
                        <span
                            title={`Sensitivity label: ${richItem.sensitivityLabel.displayName}. This label controls information protection policies for this container.`}
                            style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: 'var(--vscode-badge-background)',
                                color: 'var(--vscode-badge-foreground)',
                                border: '1px solid var(--vscode-focusBorder, transparent)',
                                cursor: 'default', userSelect: 'none',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span className="codicon codicon-shield" style={{ fontSize: 10 }} />
                            {richItem.sensitivityLabel!.displayName}
                        </span>
                    )}
                    {richItem.lockState === 'lockedReadOnly' && (
                        <span
                            title="This container is locked in read-only mode. Content cannot be modified until the lock is removed."
                            style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: 'var(--vscode-inputValidation-warningBackground, rgba(204,167,0,0.15))',
                                color: 'var(--vscode-terminal-ansiYellow, #cca700)',
                                border: '1px solid var(--vscode-terminal-ansiYellow, #cca70040)',
                                cursor: 'default', userSelect: 'none',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span className="codicon codicon-lock" style={{ fontSize: 10 }} />
                            Read Only
                        </span>
                    )}
                    {richItem.status === 'inactive' && (
                        <span
                            title="This container is inactive. Inactive containers are scheduled for automatic deletion within 24 hours. Any modification to the container — such as adding a file or updating a property — will activate it."
                            style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: 'var(--vscode-inputValidation-errorBackground, rgba(120,0,0,0.15))',
                                color: 'var(--vscode-errorForeground, #f48771)',
                                border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
                                cursor: 'default', userSelect: 'none',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span className="codicon codicon-warning" style={{ fontSize: 10 }} />
                            Inactive
                        </span>
                    )}
                </div>
            )}

            {/* Name (editable) */}
            <div style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...labelStyle }}>
                    <span>Name</span>
                    {!editingName && (
                        <button className="icon-btn" title="Edit name" style={{ fontSize: 12 }} onClick={() => { setNameDraft(richItem.name); setNameError(null); setEditingName(true); }}>
                            <span className="codicon codicon-edit" />
                        </button>
                    )}
                </div>
                {editingName ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                            autoFocus style={inputStyle} value={nameDraft}
                            onChange={e => setNameDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                            disabled={nameBusy}
                        />
                        {nameError && <span style={{ fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{nameError}</span>}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="action-btn" onClick={saveName} disabled={nameBusy || !nameDraft.trim()}>
                                {nameBusy ? <span className="codicon codicon-loading codicon-modifier-spin" /> : 'Save'}
                            </button>
                            <button className="action-btn" onClick={() => setEditingName(false)} disabled={nameBusy}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: 12, overflowWrap: 'break-word' }}>{richItem.name}</div>
                )}
            </div>

            {/* ID (copy) */}
            <div style={rowStyle}>
                <div style={{ ...labelStyle }}>ID</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, opacity: 0.85 }} title={richItem.id}>
                        {richItem.id}
                    </span>
                    <button className="icon-btn" title={copied === 'id' ? 'Copied!' : 'Copy ID'} style={{ fontSize: 12, flexShrink: 0 }} onClick={() => copyToClipboard('id', richItem.id)}>
                        <span className={`codicon codicon-${copied === 'id' ? 'check' : 'copy'}`} style={copied === 'id' ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined} />
                    </button>
                </div>
            </div>

            {/* Type */}
            <div style={rowStyle}>
                <div style={labelStyle}>Type</div>
                <div style={{ fontSize: 12 }}>Container</div>
            </div>

            {/* Created */}
            {richItem.createdAt && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Created</div>
                    <div style={{ fontSize: 12 }}>{richItem.createdAt}</div>
                </div>
            )}

            {/* Modified */}
            <div style={rowStyle}>
                <div style={labelStyle}>Modified</div>
                <div style={{ fontSize: 12 }}>{richItem.modifiedAt}</div>
            </div>

            {/* Storage used */}
            {richItem.size && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Storage Used</div>
                    <div style={{ fontSize: 12 }}>{richItem.size}</div>
                </div>
            )}

            {/* Description (editable) */}
            <div style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...labelStyle }}>
                    <span>Description</span>
                    {!editingDesc && (
                        <button className="icon-btn" title="Edit description" style={{ fontSize: 12 }} onClick={() => { setDescDraft(richItem.description ?? ''); setDescError(null); setEditingDesc(true); }}>
                            <span className="codicon codicon-edit" />
                        </button>
                    )}
                </div>
                {editingDesc ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <textarea
                            autoFocus rows={3}
                            style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.4' }}
                            value={descDraft}
                            onChange={e => setDescDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false); }}
                            disabled={descBusy}
                        />
                        {descError && <span style={{ fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{descError}</span>}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="action-btn" onClick={saveDescription} disabled={descBusy}>
                                {descBusy ? <span className="codicon codicon-loading codicon-modifier-spin" /> : 'Save'}
                            </button>
                            <button className="action-btn" onClick={() => setEditingDesc(false)} disabled={descBusy}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: 12, opacity: richItem.description ? 1 : 0.4, fontStyle: richItem.description ? 'normal' : 'italic' }}>
                        {richItem.description || 'No description'}
                    </div>
                )}
            </div>

            {/* Container Type ID (copy) */}
            {richItem.containerTypeId && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Container Type ID</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, opacity: 0.85 }} title={richItem.containerTypeId}>
                            {richItem.containerTypeId}
                        </span>
                        <button className="icon-btn" title={copied === 'containerTypeId' ? 'Copied!' : 'Copy Container Type ID'} style={{ fontSize: 12, flexShrink: 0 }} onClick={() => copyToClipboard('containerTypeId', richItem.containerTypeId!)}>
                            <span className={`codicon codicon-${copied === 'containerTypeId' ? 'check' : 'copy'}`} style={copied === 'containerTypeId' ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined} />
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
