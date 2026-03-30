import React from 'react';
import { DUMMY_METADATA } from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';

interface MetadataPanelProps {
    item: StorageItem | null;
}

export function MetadataPanel({ item }: MetadataPanelProps) {
    if (!item) {
        return <EmptyHint text="Select an item to view its metadata fields." />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
                <button className="action-btn" title="Add field">
                    <span className="codicon codicon-add" />
                    Add field
                </button>
            </div>
            {DUMMY_METADATA.map(field => (
                <div
                    key={field.name}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 4,
                        padding: '6px 0',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        alignItems: 'center',
                    }}
                >
                    <span style={{ opacity: 0.7, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {field.name}
                    </span>
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {field.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

function EmptyHint({ text }: { text: string }) {
    return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>{text}</p>;
}
