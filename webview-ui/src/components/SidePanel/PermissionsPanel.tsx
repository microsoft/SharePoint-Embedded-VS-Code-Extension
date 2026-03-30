import React from 'react';
import { DUMMY_PERMISSIONS } from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';

interface PermissionsPanelProps {
    item: StorageItem | null;
}

const ROLE_COLORS: Record<string, string> = {
    Owner: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    Write: 'var(--vscode-symbolIcon-variableForeground, #9CDCFE)',
    Read: 'var(--vscode-foreground)',
};

export function PermissionsPanel({ item }: PermissionsPanelProps) {
    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its permissions.</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
                <button className="action-btn" title="Add permission">
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>
            {DUMMY_PERMISSIONS.map((p, i) => (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 0',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                    }}
                >
                    <span
                        className={`codicon ${p.type === 'Group' ? 'codicon-organization' : 'codicon-account'}`}
                        style={{ fontSize: 14, opacity: 0.7, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.identity}
                        </div>
                        <div style={{ fontSize: 11, color: ROLE_COLORS[p.role] ?? 'var(--vscode-foreground)' }}>
                            {p.role}
                        </div>
                    </div>
                    <button className="icon-btn" title="Remove permission" style={{ fontSize: 13 }}>
                        <span className="codicon codicon-close" />
                    </button>
                </div>
            ))}
        </div>
    );
}
