import React, { useState } from 'react';
import { UploadFile, UploadStatus } from '../../models/StorageItem';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function pct(u: UploadFile): number {
    if (u.size === 0) return 100;
    return Math.round((u.uploaded / u.size) * 100);
}

// ── Status color + label ──────────────────────────────────────────────────────

const STATUS_COLOR: Record<UploadStatus, string> = {
    pending:   'var(--vscode-foreground)',
    uploading: 'var(--vscode-progressBar-background, #0e70c0)',
    paused:    'var(--vscode-terminal-ansiYellow, #cca700)',
    completed: 'var(--vscode-terminal-ansiGreen, #89d185)',
    failed:    'var(--vscode-errorForeground)',
};

const STATUS_LABEL: Record<UploadStatus, string> = {
    pending:   'Waiting…',
    uploading: 'Uploading',
    paused:    'Paused',
    completed: 'Done',
    failed:    'Failed',
};

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ upload }: { upload: UploadFile }) {
    const p = pct(upload);
    const color = STATUS_COLOR[upload.status];
    const isActive = upload.status === 'uploading';

    return (
        <div
            style={{
                height: 3,
                borderRadius: 2,
                background: 'var(--vscode-panel-border)',
                overflow: 'hidden',
                marginTop: 5,
            }}
        >
            <div
                style={{
                    height: '100%',
                    width: `${p}%`,
                    borderRadius: 2,
                    background: color,
                    transition: isActive ? 'width 0.28s linear' : 'none',
                }}
            />
        </div>
    );
}

// ── Per-file row ───────────────────────────────────────────────────────────────

function UploadRow({ upload }: { upload: UploadFile }) {
    const { pauseUpload, resumeUpload, cancelUpload, retryUpload, dismissUpload } = useStorageExplorer();
    const p = pct(upload);
    const color = STATUS_COLOR[upload.status];

    return (
        <div style={{ padding: '8px 0', borderBottom: '1px solid var(--vscode-panel-border)' }}>
            {/* File name + status badge */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span
                    style={{
                        flex: 1,
                        fontSize: 12,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                    title={upload.name}
                >
                    {upload.name}
                </span>
                <span style={{ fontSize: 11, color, flexShrink: 0 }}>
                    {upload.status === 'uploading'
                        ? `${p}%`
                        : STATUS_LABEL[upload.status]}
                </span>
            </div>

            {/* Size info */}
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 1 }}>
                {upload.status === 'completed'
                    ? formatBytes(upload.size)
                    : `${formatBytes(upload.uploaded)} / ${formatBytes(upload.size)}`}
            </div>

            {/* Error message */}
            {upload.error && (
                <div style={{ fontSize: 11, color: 'var(--vscode-errorForeground)', marginTop: 3 }}>
                    {upload.error}
                </div>
            )}

            {/* Progress bar (not shown for completed/failed) */}
            {(upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'pending') && (
                <ProgressBar upload={upload} />
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                {upload.status === 'uploading' && (
                    <RowBtn icon="codicon-debug-pause" label="Pause" onClick={() => pauseUpload(upload.id)} />
                )}
                {upload.status === 'paused' && (
                    <RowBtn icon="codicon-play" label="Resume" onClick={() => resumeUpload(upload.id)} />
                )}
                {upload.status === 'failed' && (
                    <RowBtn icon="codicon-refresh" label="Retry" onClick={() => retryUpload(upload.id)} />
                )}
                {(upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'pending') && (
                    <RowBtn icon="codicon-close" label="Cancel" onClick={() => cancelUpload(upload.id)} />
                )}
                {(upload.status === 'completed' || upload.status === 'failed') && (
                    <RowBtn icon="codicon-close" label="Dismiss" onClick={() => dismissUpload(upload.id)} />
                )}
            </div>
        </div>
    );
}

function RowBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
    return (
        <button
            className="action-btn"
            onClick={onClick}
            title={label}
            style={{ fontSize: 11, padding: '2px 6px', gap: 3 }}
        >
            <span className={`codicon ${icon}`} style={{ fontSize: 11 }} />
            {label}
        </button>
    );
}

// ── Summary header (collapsed view) ───────────────────────────────────────────

function summaryText(uploads: UploadFile[]): string {
    const active = uploads.filter(u => u.status === 'uploading' || u.status === 'pending' || u.status === 'paused');
    const done   = uploads.filter(u => u.status === 'completed');
    const failed = uploads.filter(u => u.status === 'failed');
    const parts: string[] = [];
    if (active.length)  parts.push(`${active.length} uploading`);
    if (done.length)    parts.push(`${done.length} done`);
    if (failed.length)  parts.push(`${failed.length} failed`);
    return parts.join(' · ') || 'No uploads';
}

// ── Main floating card ─────────────────────────────────────────────────────────

export function UploadCard() {
    const {
        uploads, uploadCardOpen, closeUploadCard,
        dismissAllCompleted,
    } = useStorageExplorer();

    const [collapsed, setCollapsed] = useState(false);

    if (!uploadCardOpen || uploads.length === 0) return null;

    const hasCompleted = uploads.some(u => u.status === 'completed');
    const allDone = uploads.every(u => u.status === 'completed' || u.status === 'failed');

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                width: 340,
                maxHeight: collapsed ? 'auto' : 420,
                backgroundColor: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: 6,
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                zIndex: 9990,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* ── Card header ── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 10px',
                    borderBottom: collapsed ? 'none' : '1px solid var(--vscode-panel-border)',
                    flexShrink: 0,
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <span className="codicon codicon-cloud-upload" style={{ fontSize: 14, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
                    {summaryText(uploads)}
                </span>
                {/* Toolbar: clear completed, collapse, close */}
                <div
                    style={{ display: 'flex', gap: 2 }}
                    onClick={e => e.stopPropagation()} // don't toggle collapse
                >
                    {hasCompleted && !collapsed && (
                        <button
                            className="icon-btn"
                            title="Clear completed"
                            style={{ fontSize: 13 }}
                            onClick={dismissAllCompleted}
                        >
                            <span className="codicon codicon-check-all" />
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        title={collapsed ? 'Expand' : 'Collapse'}
                        style={{ fontSize: 13 }}
                        onClick={() => setCollapsed(c => !c)}
                    >
                        <span className={`codicon ${collapsed ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} />
                    </button>
                    <button
                        className="icon-btn"
                        title="Close"
                        style={{ fontSize: 13 }}
                        onClick={closeUploadCard}
                    >
                        <span className="codicon codicon-close" />
                    </button>
                </div>
            </div>

            {/* ── File list ── */}
            {!collapsed && (
                <div style={{ overflowY: 'auto', padding: '0 12px' }}>
                    {uploads.map(u => <UploadRow key={u.id} upload={u} />)}
                </div>
            )}
        </div>
    );
}
