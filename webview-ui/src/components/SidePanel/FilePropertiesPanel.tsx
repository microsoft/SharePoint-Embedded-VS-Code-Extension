import React, { useEffect, useState } from 'react';
import { StorageItem } from '../../models/StorageItem';
import { DriveItemDetails } from '../../api/services/DriveGraphService';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function camelToTitle(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

function formatDuration(ms: number): string {
    const totalSecs = Math.round(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatMediaValue(key: string, value: any): string {
    if (value == null) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (key === 'duration') return formatDuration(Number(value));
    if (key === 'bitrate') return `${Math.round(Number(value) / 1000)} kbps`;
    if (key === 'takenDateTime') return formatDate(String(value));
    if (key === 'fNumber') return `f/${value}`;
    if (key === 'focalLength') return `${value} mm`;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

const SHAREPOINTID_LABELS: Record<string, string> = {
    siteId: 'Site ID',
    webId: 'Web ID',
    listId: 'List ID',
    listItemId: 'List Item ID',
    listItemUniqueId: 'List Item Unique ID',
    siteUrl: 'Site URL',
    tenantId: 'Tenant ID',
};

const AUDIO_LABELS: Record<string, string> = {
    album: 'Album', albumArtist: 'Album Artist', artist: 'Artist',
    bitrate: 'Bitrate', composers: 'Composers', copyright: 'Copyright',
    disc: 'Disc', discCount: 'Disc Count', duration: 'Duration',
    genre: 'Genre', hasDrm: 'DRM Protected', isVariableBitrate: 'Variable Bitrate',
    title: 'Title', track: 'Track', trackCount: 'Track Count', year: 'Year',
};

const IMAGE_LABELS: Record<string, string> = {
    width: 'Width', height: 'Height',
};

const PHOTO_LABELS: Record<string, string> = {
    takenDateTime: 'Date Taken', cameraMake: 'Camera Make', cameraModel: 'Camera Model',
    focalLength: 'Focal Length', fNumber: 'Aperture',
    exposureNumerator: 'Exposure Numerator', exposureDenominator: 'Exposure Denominator',
    iso: 'ISO',
};

const VIDEO_LABELS: Record<string, string> = {
    width: 'Width', height: 'Height', duration: 'Duration', bitrate: 'Bitrate',
    framerate: 'Frame Rate', audioBitsPerSample: 'Audio Bits/Sample',
    audioChannels: 'Audio Channels', audioFormat: 'Audio Format',
    audioSamplesPerSecond: 'Audio Sample Rate', fourCC: 'FourCC',
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
    padding: '6px 0',
    borderBottom: '1px solid var(--vscode-panel-border)',
};

const labelStyle: React.CSSProperties = {
    fontSize: 11, opacity: 0.6, marginBottom: 3,
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '4px 7px', fontSize: 12, boxSizing: 'border-box',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-focusBorder, var(--vscode-input-border))',
    borderRadius: 3, outline: 'none',
    fontFamily: 'var(--vscode-font-family)',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: 10, fontWeight: 600, opacity: 0.55,
            padding: '12px 0 4px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            borderTop: '1px solid var(--vscode-panel-border)',
            marginTop: 4,
        }}>
            {title}
        </div>
    );
}

function KvRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={rowStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 12, overflowWrap: 'break-word' }}>{value}</div>
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface FilePropertiesPanelProps {
    item: StorageItem | null;
}

export function FilePropertiesPanel({ item }: FilePropertiesPanelProps) {
    const { api, currentDriveId, refresh } = useStorageExplorer();

    const [details, setDetails] = useState<DriveItemDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Name edit state
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [nameBusy, setNameBusy] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);

    // Copy feedback: key of the field that was just copied
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const driveId = currentDriveId ?? '';

    useEffect(() => {
        setDetails(null);
        setLoadError(null);
        setEditingName(false);
        setNameError(null);
        if (!item || !driveId) return;
        setLoading(true);
        api.drive.getDetailedDriveItem(driveId, item.id)
            .then(setDetails)
            .catch((err: any) => setLoadError(err?.message ?? 'Failed to load details.'))
            .finally(() => setLoading(false));
    }, [item?.id, driveId]); // eslint-disable-line react-hooks/exhaustive-deps

    function copy(key: string, value: string) {
        navigator.clipboard.writeText(value).then(() => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1500);
        }).catch(() => { });
    }

    async function saveName() {
        const trimmed = nameDraft.trim();
        const currentName = details?.name ?? item?.name ?? '';
        if (!trimmed || trimmed === currentName) { setEditingName(false); return; }
        setNameBusy(true);
        setNameError(null);
        try {
            await api.drive.rename(driveId, item!.id, trimmed);
            setEditingName(false);
            setDetails(d => d ? { ...d, name: trimmed } : d);
            await refresh();
        } catch (err: any) {
            setNameError(err?.message ?? 'Failed to rename.');
        } finally {
            setNameBusy(false);
        }
    }

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its properties.</p>;
    }

    // ── Loading state ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6, fontSize: 12, padding: '6px 0' }}>
                <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                Loading…
            </div>
        );
    }

    // ── Error state — show error + basic fallback properties ──────────────────
    if (loadError || !details) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {loadError && (
                    <div style={{ fontSize: 11, color: 'var(--vscode-errorForeground)', marginBottom: 8 }}>
                        <span className="codicon codicon-warning" style={{ marginRight: 4 }} />
                        {loadError}
                    </div>
                )}
                <KvRow label="Name" value={item.name} />
                <KvRow label="Type" value={item.type} />
                <KvRow label="Modified" value={item.modifiedAt} />
                {item.size ? <KvRow label="Size" value={item.size} /> : null}
            </div>
        );
    }

    // ── Full panel ────────────────────────────────────────────────────────────

    const isFile = item.kind === 'file';
    const isFolder = item.kind === 'folder';
    const name = details.name;

    // Badges
    const isCheckedOut = details.publication?.level === 'checkout'
        || !!(details.publication as any)?.checkedOutBy;
    const hasMalware = !!details.malware;
    const retentionLabelName = details.retentionLabel?.name as string | undefined;
    const hasBadges = isCheckedOut || hasMalware || !!retentionLabelName;

    // Helper: a row whose value is truncated + has a copy button
    function CopyableRow({ label, copyKey, value }: { label: string; copyKey: string; value: string | undefined | null }) {
        if (!value) return null;
        return (
            <div style={rowStyle}>
                <div style={labelStyle}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                        style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, opacity: 0.85 }}
                        title={value}
                    >
                        {value}
                    </span>
                    <button
                        className="icon-btn"
                        title={copiedKey === copyKey ? 'Copied!' : `Copy ${label}`}
                        style={{ fontSize: 12, flexShrink: 0 }}
                        onClick={() => copy(copyKey, value)}
                    >
                        <span
                            className={`codicon codicon-${copiedKey === copyKey ? 'check' : 'copy'}`}
                            style={copiedKey === copyKey ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined}
                        />
                    </button>
                </div>
            </div>
        );
    }

    // Helper: inlined section with key-value rows (copy-able)
    function SpidSection() {
        const entries = Object.entries(details!.sharepointIds ?? {}).filter(([, v]) => v != null);
        if (entries.length === 0) return null;
        return (
            <>
                <SectionHeader title="SharePoint IDs" />
                {entries.map(([k, v]) => {
                    const ck = `spid-${k}`;
                    const label = SHAREPOINTID_LABELS[k] ?? camelToTitle(k);
                    return (
                        <div key={k} style={rowStyle}>
                            <div style={labelStyle}>{label}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span
                                    style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, opacity: 0.85 }}
                                    title={String(v)}
                                >
                                    {String(v)}
                                </span>
                                <button
                                    className="icon-btn"
                                    title={copiedKey === ck ? 'Copied!' : `Copy ${label}`}
                                    style={{ fontSize: 12, flexShrink: 0 }}
                                    onClick={() => copy(ck, String(v))}
                                >
                                    <span
                                        className={`codicon codicon-${copiedKey === ck ? 'check' : 'copy'}`}
                                        style={copiedKey === ck ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined}
                                    />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </>
        );
    }

    // Helper: inlined media facet section (display-only, no copy)
    function MediaSection({ title, facet, labels }: {
        title: string;
        facet: Record<string, any> | undefined;
        labels: Record<string, string>;
    }) {
        const entries = Object.entries(facet ?? {}).filter(([, v]) => v != null);
        if (entries.length === 0) return null;
        return (
            <>
                <SectionHeader title={title} />
                {entries.map(([k, v]) => (
                    <div key={k} style={rowStyle}>
                        <div style={labelStyle}>{labels[k] ?? camelToTitle(k)}</div>
                        <div style={{ fontSize: 12, overflowWrap: 'break-word' }}>
                            {formatMediaValue(k, v)}
                        </div>
                    </div>
                ))}
            </>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

            {/* ── Badges ─────────────────────────────────────────────────── */}
            {hasBadges && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 0 10px' }}>
                    {isCheckedOut && (
                        <span
                            title="This file is currently checked out for editing."
                            style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: 'var(--vscode-badge-background)',
                                color: 'var(--vscode-badge-foreground)',
                                border: '1px solid var(--vscode-focusBorder, transparent)',
                                cursor: 'default', userSelect: 'none',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span className="codicon codicon-edit" style={{ fontSize: 10 }} />
                            Checked Out
                        </span>
                    )}
                    {hasMalware && (
                        <span
                            title={details.malware?.description ?? 'This file has been flagged as containing malware.'}
                            style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: 'var(--vscode-inputValidation-errorBackground, rgba(120,0,0,0.15))',
                                color: 'var(--vscode-errorForeground, #f48771)',
                                border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
                                cursor: 'default', userSelect: 'none',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span className="codicon codicon-bug" style={{ fontSize: 10 }} />
                            Malware Detected
                        </span>
                    )}
                    {retentionLabelName && (
                        <span
                            title={`Retention label: ${retentionLabelName}`}
                            style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: 'var(--vscode-inputValidation-warningBackground, rgba(204,167,0,0.15))',
                                color: 'var(--vscode-terminal-ansiYellow, #cca700)',
                                border: '1px solid var(--vscode-terminal-ansiYellow, #cca70040)',
                                cursor: 'default', userSelect: 'none',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span className="codicon codicon-law" style={{ fontSize: 10 }} />
                            {retentionLabelName}
                        </span>
                    )}
                </div>
            )}

            {/* ── Name (editable) ─────────────────────────────────────────── */}
            <div style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...labelStyle }}>
                    <span>Name</span>
                    {!editingName && (
                        <button
                            className="icon-btn"
                            title="Edit name"
                            style={{ fontSize: 12 }}
                            onClick={() => { setNameDraft(name); setNameError(null); setEditingName(true); }}
                        >
                            <span className="codicon codicon-edit" />
                        </button>
                    )}
                </div>
                {editingName ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                            autoFocus
                            style={inputStyle}
                            value={nameDraft}
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
                    <div style={{ fontSize: 12, overflowWrap: 'break-word' }}>{name}</div>
                )}
            </div>

            {/* ── ID (copy) ────────────────────────────────────────────────── */}
            <CopyableRow label="ID" copyKey="id" value={item.id} />

            {/* ── Type ─────────────────────────────────────────────────────── */}
            <div style={rowStyle}>
                <div style={labelStyle}>Type</div>
                <div style={{ fontSize: 12 }}>{item.type}</div>
            </div>

            {/* ── Created ──────────────────────────────────────────────────── */}
            {details.createdDateTime && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Created</div>
                    <div style={{ fontSize: 12 }}>{formatDate(details.createdDateTime)}</div>
                </div>
            )}

            {/* ── Modified ─────────────────────────────────────────────────── */}
            {details.lastModifiedDateTime && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Modified</div>
                    <div style={{ fontSize: 12 }}>{formatDate(details.lastModifiedDateTime)}</div>
                </div>
            )}

            {/* ── Size ─────────────────────────────────────────────────────── */}
            {item.size && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Size</div>
                    <div style={{ fontSize: 12 }}>{item.size}</div>
                </div>
            )}

            {/* ── MIME Type (file only) ─────────────────────────────────────── */}
            {isFile && details.mimeType && (
                <div style={rowStyle}>
                    <div style={labelStyle}>MIME Type</div>
                    <div style={{ fontSize: 12 }}>{details.mimeType}</div>
                </div>
            )}

            {/* ── Child Count (folder only) ─────────────────────────────────── */}
            {isFolder && details.childCount != null && (
                <div style={rowStyle}>
                    <div style={labelStyle}>Child Count</div>
                    <div style={{ fontSize: 12 }}>{details.childCount}</div>
                </div>
            )}

            {/* ── Parent ID (copy) ─────────────────────────────────────────── */}
            <CopyableRow label="Parent ID" copyKey="parentId" value={details.parentId} />

            {/* ── Web URL (copy) ───────────────────────────────────────────── */}
            <CopyableRow label="Web URL" copyKey="webUrl" value={details.webUrl} />

            {/* ── Download URL (file only, copy) ───────────────────────────── */}
            {isFile && <CopyableRow label="Download URL" copyKey="downloadUrl" value={details.downloadUrl} />}

            {/* ── WebDAV URL (copy) ────────────────────────────────────────── */}
            <CopyableRow label="WebDAV URL" copyKey="webDavUrl" value={details.webDavUrl} />

            {/* ── SharePoint IDs ───────────────────────────────────────────── */}
            <SpidSection />

            {/* ── Media facets ─────────────────────────────────────────────── */}
            <MediaSection title="Audio"  facet={details.audio}  labels={AUDIO_LABELS}  />
            <MediaSection title="Image"  facet={details.image}  labels={IMAGE_LABELS}  />
            <MediaSection title="Photo"  facet={details.photo}  labels={PHOTO_LABELS}  />
            <MediaSection title="Video"  facet={details.video}  labels={VIDEO_LABELS}  />

        </div>
    );
}
