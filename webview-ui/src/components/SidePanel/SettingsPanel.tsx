import React, { useState, useEffect } from 'react';
import type { FileStorageContainerSettings } from '@microsoft/microsoft-graph-types';
import { StorageItem } from '../../models/StorageItem';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

const VERSIONING_LIMIT_MIN = 1;
const VERSIONING_LIMIT_MAX = 50000;

export function SettingsPanel({ item }: { item: StorageItem | null }) {
    const { api } = useStorageExplorer();

    const [settings, setSettings] = useState<FileStorageContainerSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Per-field saving state
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

    // Local draft state
    const [draft, setDraft] = useState<FileStorageContainerSettings>({});

    useEffect(() => {
        if (!item || item.kind !== 'container') return;
        setLoading(true);
        setLoadError(null);
        setSaveErrors({});
        api.containers.getSettings(item.id)
            .then(s => { setSettings(s); setDraft(s); })
            .catch((err: any) => setLoadError(err?.message ?? 'Failed to load settings.'))
            .finally(() => setLoading(false));
    }, [item?.id]); // eslint-disable-line

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select a container to view its settings.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Settings are only available for containers.</p>;
    }

    async function saveSetting(field: keyof FileStorageContainerSettings, value: unknown) {
        setSaving(p => ({ ...p, [field]: true }));
        setSaveErrors(p => ({ ...p, [field]: '' }));
        try {
            await api.containers.updateSettings(item!.id, { [field]: value });
            setSettings(prev => prev ? { ...prev, [field]: value } : { [field]: value });
        } catch (err: any) {
            setSaveErrors(p => ({ ...p, [field]: err?.message ?? 'Failed to save.' }));
            // Revert draft on failure
            setDraft(prev => ({ ...prev, [field]: settings?.[field] ?? null }));
        } finally {
            setSaving(p => ({ ...p, [field]: false }));
        }
    }

    const rowStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '10px 0',
        borderBottom: '1px solid var(--vscode-panel-border)',
    };
    const labelStyle: React.CSSProperties = {
        fontSize: 12, fontWeight: 600,
    };
    const descStyle: React.CSSProperties = {
        fontSize: 11, opacity: 0.55, lineHeight: '1.4',
    };
    const errorStyle: React.CSSProperties = {
        fontSize: 11, color: 'var(--vscode-errorForeground)', marginTop: 2,
    };
    const checkRowStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', opacity: 0.6, fontSize: 12 }}>
                <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                Loading settings…
            </div>
        );
    }
    if (loadError) {
        return <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{loadError}</p>;
    }
    if (!settings) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* Versioning enabled */}
            <div style={rowStyle}>
                <div style={checkRowStyle}>
                    <div>
                        <div style={labelStyle}>Item versioning</div>
                        <div style={descStyle}>Keep version history for files in this container.</div>
                    </div>
                    <Toggle
                        checked={draft.isItemVersioningEnabled ?? false}
                        busy={!!saving['isItemVersioningEnabled']}
                        onChange={val => {
                            setDraft(d => ({ ...d, isItemVersioningEnabled: val }));
                            saveSetting('isItemVersioningEnabled', val);
                        }}
                    />
                </div>
                {saveErrors['isItemVersioningEnabled'] && (
                    <span style={errorStyle}>{saveErrors['isItemVersioningEnabled']}</span>
                )}
            </div>

            {/* Major version limit */}
            <div style={rowStyle}>
                <div style={labelStyle}>Maximum major versions</div>
                <div style={descStyle}>
                    Limit how many major versions are retained per item ({VERSIONING_LIMIT_MIN}–{VERSIONING_LIMIT_MAX.toLocaleString()}).
                    Set to 0 to keep all versions.
                </div>
                <VersionLimitInput
                    value={draft.itemMajorVersionLimit ?? null}
                    busy={!!saving['itemMajorVersionLimit']}
                    onChange={val => {
                        setDraft(d => ({ ...d, itemMajorVersionLimit: val }));
                        saveSetting('itemMajorVersionLimit', val);
                    }}
                />
                {saveErrors['itemMajorVersionLimit'] && (
                    <span style={errorStyle}>{saveErrors['itemMajorVersionLimit']}</span>
                )}
            </div>

            {/* OCR */}
            <div style={rowStyle}>
                <div style={checkRowStyle}>
                    <div>
                        <div style={labelStyle}>Optical Character Recognition (OCR)</div>
                        <div style={descStyle}>
                            Extract text from images and PDFs into searchable metadata.
                        </div>
                    </div>
                    <Toggle
                        checked={draft.isOcrEnabled ?? false}
                        busy={!!saving['isOcrEnabled']}
                        onChange={val => {
                            setDraft(d => ({ ...d, isOcrEnabled: val }));
                            saveSetting('isOcrEnabled', val);
                        }}
                    />
                </div>
                {saveErrors['isOcrEnabled'] && (
                    <span style={errorStyle}>{saveErrors['isOcrEnabled']}</span>
                )}
            </div>

        </div>
    );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
    checked,
    busy,
    onChange,
}: {
    checked: boolean;
    busy: boolean;
    onChange: (val: boolean) => void;
}) {
    const track: React.CSSProperties = {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 34,
        height: 18,
        borderRadius: 9,
        flexShrink: 0,
        cursor: busy ? 'default' : 'pointer',
        background: checked
            ? 'var(--vscode-button-background)'
            : 'var(--vscode-input-border, rgba(127,127,127,0.4))',
        opacity: busy ? 0.6 : 1,
        transition: 'background 0.15s',
    };
    const thumb: React.CSSProperties = {
        position: 'absolute',
        left: checked ? 18 : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: 'var(--vscode-button-foreground, #fff)',
        transition: 'left 0.15s',
    };

    return (
        <button
            role="switch"
            aria-checked={checked}
            disabled={busy}
            onClick={() => onChange(!checked)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer' }}
            title={checked ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        >
            <div style={track}>
                {busy
                    ? <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 11, margin: '0 auto', color: 'var(--vscode-button-foreground, #fff)' }} />
                    : <div style={thumb} />
                }
            </div>
        </button>
    );
}

// ── Version limit number input ────────────────────────────────────────────────

function VersionLimitInput({
    value,
    busy,
    onChange,
}: {
    value: number | null;
    busy: boolean;
    onChange: (val: number | null) => void;
}) {
    const [local, setLocal] = useState(String(value ?? 0));

    useEffect(() => {
        setLocal(String(value ?? 0));
    }, [value]);

    function commit() {
        const n = parseInt(local, 10);
        if (isNaN(n) || n < 0) { setLocal(String(value ?? 0)); return; }
        const clamped = n === 0 ? null : Math.min(VERSIONING_LIMIT_MAX, Math.max(VERSIONING_LIMIT_MIN, n));
        setLocal(String(clamped ?? 0));
        onChange(clamped);
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
                type="number"
                min={0}
                max={VERSIONING_LIMIT_MAX}
                value={local}
                disabled={busy}
                onChange={e => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') commit(); }}
                style={{
                    width: 90,
                    padding: '4px 8px',
                    fontSize: 12,
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                    borderRadius: 3,
                    outline: 'none',
                    fontFamily: 'var(--vscode-font-family)',
                    opacity: busy ? 0.6 : 1,
                }}
            />
            {busy && <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 12, opacity: 0.6 }} />}
            <span style={{ fontSize: 11, opacity: 0.45 }}>
                {value === null || value === 0 ? 'unlimited' : `${value} versions`}
            </span>
        </div>
    );
}
