import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { Breadcrumb } from './Breadcrumb';

export function NavBar() {
    const {
        tenantDomain, toggleSidePanel, sidePanelOpen,
        toggleNetworkDrawer, networkDrawerOpen, networkRequests,
        uploads, uploadCardOpen, toggleUploadCard,
    } = useStorageExplorer();
    const hasRequests = networkRequests.length > 0;

    const activeUploads  = uploads.filter(u => u.status === 'uploading' || u.status === 'pending' || u.status === 'paused');
    const failedUploads  = uploads.filter(u => u.status === 'failed');
    const hasUploads     = uploads.length > 0;
    const uploadBadgeColor = failedUploads.length > 0
        ? 'var(--vscode-errorForeground)'
        : activeUploads.length > 0
            ? 'var(--vscode-notificationsInfoIcon-foreground, #75beff)'
            : null; // all completed — no badge

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
            {/* Network activity toggle */}
            <div style={{ position: 'relative' }}>
                <button
                    className={`icon-btn${networkDrawerOpen ? ' active' : ''}`}
                    title="Network activity"
                    onClick={toggleNetworkDrawer}
                >
                    <span className="codicon codicon-pulse" />
                </button>
                {hasRequests && !networkDrawerOpen && (
                    <span style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: 'var(--vscode-notificationsInfoIcon-foreground, #75beff)',
                        pointerEvents: 'none',
                    }} />
                )}
            </div>
            {/* Uploads toggle — only visible when there are uploads */}
            {hasUploads && (
                <div style={{ position: 'relative' }}>
                    <button
                        className={`icon-btn${uploadCardOpen ? ' active' : ''}`}
                        title={
                            failedUploads.length > 0
                                ? `Uploads — ${failedUploads.length} failed`
                                : activeUploads.length > 0
                                    ? `Uploads — ${activeUploads.length} in progress`
                                    : 'Uploads — all complete'
                        }
                        onClick={toggleUploadCard}
                    >
                        <span className="codicon codicon-cloud-upload" />
                    </button>
                    {uploadBadgeColor && !uploadCardOpen && (
                        <span style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: uploadBadgeColor,
                            pointerEvents: 'none',
                        }} />
                    )}
                </div>
            )}
            <button className={`icon-btn${sidePanelOpen ? ' active' : ''}`} title="Toggle details panel" onClick={toggleSidePanel}>
                <span className="codicon codicon-layout-sidebar-right" />
            </button>
        </div>
    );
}
