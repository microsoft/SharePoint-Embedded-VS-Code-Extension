import React, { useState } from 'react';
import { DUMMY_CONTAINER_METADATA, ContainerCustomProperty } from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';

interface AddMetadataState {
    key: string;
    value: string;
    isSearchable: boolean;
}

const DEFAULT_FORM: AddMetadataState = { key: '', value: '', isSearchable: false };

export function MetadataPanel({ item }: { item: StorageItem | null }) {
    const [properties, setProperties] = useState<ContainerCustomProperty[]>([...DUMMY_CONTAINER_METADATA]);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState<AddMetadataState>(DEFAULT_FORM);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<AddMetadataState>(DEFAULT_FORM);

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its metadata.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Custom properties (metadata) are only available for containers.</p>;
    }

    function removeProperty(key: string) {
        setProperties(prev => prev.filter(p => p.key !== key));
    }

    function confirmAdd() {
        if (!form.key.trim()) return;
        setProperties(prev => [...prev, { key: form.key.trim(), value: form.value, isSearchable: form.isSearchable }]);
        setShowAdd(false);
    }

    function openEdit(p: ContainerCustomProperty) {
        setEditForm({ key: p.key, value: p.value, isSearchable: p.isSearchable });
        setEditingKey(p.key);
    }

    function confirmEdit() {
        if (!editingKey) return;
        setProperties(prev => prev.map(p => p.key !== editingKey ? p : { ...p, value: editForm.value, isSearchable: editForm.isSearchable }));
        setEditingKey(null);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
                <button className="action-btn" onClick={() => { setForm(DEFAULT_FORM); setShowAdd(true); }}>
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {properties.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>No custom properties defined.</p>
            ) : (
                <>
                    {/* Column header — now with edit column */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 20px 28px 28px',
                        padding: '3px 0 5px', gap: 4,
                        fontSize: 11, fontWeight: 600, opacity: 0.5,
                        borderBottom: '1px solid var(--vscode-panel-border)',
                    }}>
                        <span>Key</span>
                        <span>Value</span>
                        <span title="Searchable">
                            <span className="codicon codicon-search" style={{ fontSize: 11 }} />
                        </span>
                        <span />
                        <span />
                    </div>

                    {properties.map(p => (
                        <div key={p.key} style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr 20px 28px 28px',
                            alignItems: 'center', gap: 4,
                            padding: '6px 0',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                        }}>
                            <span style={{
                                fontSize: 12, fontWeight: 600,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {p.key}
                            </span>
                            <span style={{
                                fontSize: 12, opacity: 0.9,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {p.value}
                            </span>
                            <span title={p.isSearchable ? 'Searchable' : 'Not searchable'}>
                                <span className="codicon codicon-search" style={{
                                    fontSize: 12, opacity: p.isSearchable ? 0.85 : 0.2,
                                }} />
                            </span>
                            <button
                                className="icon-btn" title="Edit" style={{ fontSize: 13, padding: '2px 4px' }}
                                onClick={() => openEdit(p)}
                            >
                                <span className="codicon codicon-edit" />
                            </button>
                            <button
                                className="icon-btn" title="Remove" style={{ fontSize: 13, padding: '2px 4px' }}
                                onClick={() => removeProperty(p.key)}
                            >
                                <span className="codicon codicon-close" />
                            </button>
                        </div>
                    ))}
                </>
            )}

            {showAdd && (
                <Modal
                    title="Add custom property"
                    confirmLabel="Add"
                    confirmDisabled={!form.key.trim()}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowAdd(false)}
                >
                    <AddMetadataForm form={form} setForm={setForm} />
                </Modal>
            )}

            {editingKey !== null && (
                <Modal
                    title="Edit custom property"
                    confirmLabel="Save"
                    onConfirm={confirmEdit}
                    onCancel={() => setEditingKey(null)}
                >
                    <AddMetadataForm form={editForm} setForm={setEditForm} lockKey />
                </Modal>
            )}
        </div>
    );
}

function AddMetadataForm({
    form,
    setForm,
    lockKey = false,
}: {
    form: AddMetadataState;
    setForm: React.Dispatch<React.SetStateAction<AddMetadataState>>;
    lockKey?: boolean;
}) {
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '5px 8px', fontSize: 12,
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
        borderRadius: 3, outline: 'none',
        fontFamily: 'var(--vscode-font-family)',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
                <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>
                    Key {!lockKey && <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>}
                </label>
                {lockKey ? (
                    <div style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed', userSelect: 'none' }}>
                        {form.key}
                    </div>
                ) : (
                    <input
                        autoFocus
                        style={inputStyle}
                        placeholder="e.g. costCenter"
                        value={form.key}
                        onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                    />
                )}
            </div>
            <div>
                <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>Value</label>
                <input
                    autoFocus={lockKey}
                    style={inputStyle}
                    placeholder="Property value"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                    type="checkbox"
                    checked={form.isSearchable}
                    onChange={e => setForm(f => ({ ...f, isSearchable: e.target.checked }))}
                />
                Searchable (usable in search queries)
            </label>
        </div>
    );
}

