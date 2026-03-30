import React from 'react';
import { DUMMY_VERSIONS } from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';

interface VersionsPanelProps {
    item: StorageItem | null;
}

export function VersionsPanel({ item }: VersionsPanelProps) {
    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select a file to view its version history.</p>;
    }
    if (item.kind !== 'file') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Version history is only available for files.</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {DUMMY_VERSIONS.map(v => (
                <div
                    key={v.version}
                    style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>v{v.version}</span>
                        {v.isCurrent && (
                            <span
                                style={{
                                    fontSize: 10,
                                    padding: '1px 5px',
                                    borderRadius: 8,
                                    backgroundColor: 'var(--vscode-badge-background)',
                                    color: 'var(--vscode-badge-foreground)',
                                }}
                            >
                                Current
                            </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <button className="icon-btn" title="Download this version" style={{ fontSize: 13 }}>
                            <span className="codicon codicon-cloud-download" />
                        </button>
                        {!v.isCurrent && (
                            <button className="icon-btn" title="Restore this version" style={{ fontSize: 13 }}>
                                <span className="codicon codicon-history" />
                            </button>
                        )}
                    </div>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{v.modifiedBy} · {v.modifiedAt}</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{v.size}</span>
                </div>
            ))}
        </div>
    );
}
