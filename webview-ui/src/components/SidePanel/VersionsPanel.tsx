import React, { useEffect, useState } from 'react';
import { StorageItem } from '../../models/StorageItem';
import { DriveItemVersion } from '../../api/services/DriveGraphService';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { openUrl } from '../../utils/openUrl';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

// ── Per-row component ─────────────────────────────────────────────────────────

function VersionRow({ version, isCurrent, driveId, itemId, onRestored, onDeleted }: {
    version: DriveItemVersion;
    isCurrent: boolean;
    driveId: string;
    itemId: string;
    onRestored: () => void;
    onDeleted: () => void;
}) {
    const { api } = useStorageExplorer();
    const [downloading, setDownloading] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const versionId = version.id ?? '';
    const author = version.lastModifiedBy?.user?.displayName
        ?? version.lastModifiedBy?.user?.email
        ?? '—';
    const modifiedAt = formatDate(version.lastModifiedDateTime);
    const size = formatBytes(version.size);
    const isBusy = downloading || restoring || deleting;

    async function handleDownload() {
        setDownloading(true);
        setError(null);
        try {
            const url = await api.drive.getVersionDownloadUrl(driveId, itemId, versionId);
            openUrl(url);
        } catch (err: any) {
            setError(err?.message ?? 'Failed to get download URL.');
        } finally {
            setDownloading(false);
        }
    }

    async function handleRestore() {
        setRestoring(true);
        setError(null);
        try {
            await api.drive.restoreVersion(driveId, itemId, versionId);
            onRestored();
        } catch (err: any) {
            setError(err?.message ?? 'Failed to restore version.');
        } finally {
            setRestoring(false);
        }
    }

    async function handleDelete() {
        setDeleting(true);
        setError(null);
        try {
            await api.drive.deleteVersion(driveId, itemId, versionId);
            onDeleted();
        } catch (err: any) {
            setError(err?.message ?? 'Failed to delete version.');
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div
            style={{
                padding: '8px 0',
                borderBottom: '1px solid var(--vscode-panel-border)',
                opacity: isBusy ? 0.55 : 1,
                transition: 'opacity 0.15s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Version label */}
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {versionId ? `v${versionId}` : '—'}
                </span>

                {isCurrent && (
                    <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 8,
                        backgroundColor: 'var(--vscode-badge-background)',
                        color: 'var(--vscode-badge-foreground)',
                        flexShrink: 0,
                    }}>
                        Current
                    </span>
                )}

                <div style={{ flex: 1 }} />

                {/* Download */}
                <button
                    className="icon-btn"
                    title={downloading ? 'Getting download URL…' : 'Download this version'}
                    style={{ fontSize: 13 }}
                    disabled={isBusy}
                    onClick={handleDownload}
                >
                    <span className={`codicon ${downloading ? 'codicon-loading codicon-modifier-spin' : 'codicon-cloud-download'}`} />
                </button>

                {/* Restore (only for non-current versions) */}
                {!isCurrent && (
                    <button
                        className="icon-btn"
                        title={restoring ? 'Restoring…' : 'Restore this version'}
                        style={{ fontSize: 13 }}
                        disabled={isBusy}
                        onClick={handleRestore}
                    >
                        <span className={`codicon ${restoring ? 'codicon-loading codicon-modifier-spin' : 'codicon-history'}`} />
                    </button>
                )}

                {/* Delete (only for non-current versions) */}
                {!isCurrent && (
                    <button
                        className="icon-btn"
                        title={deleting ? 'Deleting…' : 'Delete this version'}
                        style={{ fontSize: 13, color: deleting ? undefined : 'var(--vscode-errorForeground)' }}
                        disabled={isBusy}
                        onClick={handleDelete}
                    >
                        <span className={`codicon ${deleting ? 'codicon-loading codicon-modifier-spin' : 'codicon-trash'}`} />
                    </button>
                )}
            </div>

            {/* Meta line */}
            <div style={{ fontSize: 11, opacity: 0.7 }}>
                {author}{modifiedAt ? ` · ${modifiedAt}` : ''}
            </div>
            {size && (
                <div style={{ fontSize: 11, opacity: 0.7 }}>{size}</div>
            )}

            {/* Inline error */}
            {error && (
                <div style={{ fontSize: 11, marginTop: 3, color: 'var(--vscode-errorForeground)' }}>
                    {error}
                </div>
            )}
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface VersionsPanelProps {
    item: StorageItem | null;
}

export function VersionsPanel({ item }: VersionsPanelProps) {
    const { api, currentDriveId } = useStorageExplorer();
    const [versions, setVersions] = useState<DriveItemVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const driveId = currentDriveId ?? '';

    function loadVersions(itemId: string) {
        if (!driveId) return;
        setLoading(true);
        setError(null);
        api.drive.listVersions(driveId, itemId)
            .then(setVersions)
            .catch((err: any) => setError(err?.message ?? 'Failed to load versions.'))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        setVersions([]);
        setError(null);
        if (item && item.kind === 'file' && driveId) {
            loadVersions(item.id);
        }
    }, [item?.id, driveId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select a file to view its version history.</p>;
    }
    if (item.kind !== 'file') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Version history is only available for files.</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6, fontSize: 12, padding: '6px 0' }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                    Loading versions…
                </div>
            )}
            {error && (
                <p style={{ margin: 0, color: 'var(--vscode-errorForeground)', fontSize: 12 }}>{error}</p>
            )}
            {!loading && !error && versions.length === 0 && (
                <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>No versions found.</p>
            )}
            {versions.map((v, idx) => (
                <VersionRow
                    key={v.id ?? idx}
                    version={v}
                    isCurrent={idx === 0}
                    driveId={driveId}
                    itemId={item.id}
                    onRestored={() => loadVersions(item.id)}
                    onDeleted={() => loadVersions(item.id)}
                />
            ))}
        </div>
    );
}
