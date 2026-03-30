import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { Breadcrumb } from './Breadcrumb';

export function NavBar() {
    const { tenantDomain, toggleSidePanel, sidePanelOpen } = useStorageExplorer();

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 12px',
                height: 44,
                borderBottom: '1px solid var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-editor-background)',
                flexShrink: 0,
                minWidth: 0,
            }}
        >
            {/* Tenant identity — far left */}
            <span className="codicon codicon-database" style={{ fontSize: 16, color: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)', flexShrink: 0 }} />
            <span
                style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 10,
                    backgroundColor: 'var(--vscode-badge-background)',
                    color: 'var(--vscode-badge-foreground)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}
            >
                {tenantDomain}
            </span>

            <div style={{ width: 1, height: 20, backgroundColor: 'var(--vscode-panel-border)', flexShrink: 0 }} />

            {/* Breadcrumb navigation (includes app name as root crumb) */}
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <Breadcrumb />
            </div>

            {/* Right-side actions */}
            <button className="icon-btn" title="Refresh" onClick={() => { /* TODO: reload from API */ }}>
                <span className="codicon codicon-refresh" />
            </button>
            <button className={`icon-btn${sidePanelOpen ? ' active' : ''}`} title="Toggle details panel" onClick={toggleSidePanel}>
                <span className="codicon codicon-layout-sidebar-right" />
            </button>
        </div>
    );
}
