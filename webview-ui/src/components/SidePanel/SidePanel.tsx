import React, { useEffect } from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { SidePanelTab, StorageItem, ItemKind } from '../../models/StorageItem';
import { MetadataPanel } from './MetadataPanel';
import { FileMetadataPanel } from './FileMetadataPanel';
import { VersionsPanel } from './VersionsPanel';
import { PermissionsPanel } from './PermissionsPanel';
import { FilePermissionsPanel } from './FilePermissionsPanel';
import { ColumnsPanel } from './ColumnsPanel';
import { getItemIcon, getItemIconColor } from '../FileList/fileListUtils';

const CONTAINER_TABS: { key: SidePanelTab; label: string; icon: string }[] = [
    { key: 'permissions', label: 'Permissions', icon: 'codicon-account' },
    { key: 'columns',     label: 'Columns',     icon: 'codicon-list-tree' },
    { key: 'metadata',    label: 'Metadata',    icon: 'codicon-tag' },
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
