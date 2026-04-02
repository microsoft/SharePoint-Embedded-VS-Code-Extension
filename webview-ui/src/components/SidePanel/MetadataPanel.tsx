import React, { useState, useEffect } from 'react';
import type { FileStorageContainerCustomPropertyValue } from '@microsoft/microsoft-graph-types';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

type MetadataRow = { key: string; value?: string; isSearchable?: boolean | null };

interface AddMetadataState {
    key: string;
    value: string;
    isSearchable: boolean;
}

const DEFAULT_FORM: AddMetadataState = { key: '', value: '', isSearchable: false };

export function MetadataPanel({ item }: { item: StorageItem | null }) {
    const { api } = useStorageExplorer();

    const [properties, setProperties] = useState<MetadataRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState<AddMetadataState>(DEFAULT_FORM);
    const [addBusy, setAddBusy] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<AddMetadataState>(DEFAULT_FORM);
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [removingKey, setRemovingKey] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);

    useEffect(() => {
        if (!item || item.kind !== 'container') return;
        setLoading(true);
        setLoadError(null);
        api.containers.getCustomProperties(item.id)
            .then(props => setProperties(
                Object.entries(props).map(([key, v]) => ({ key, value: v.value, isSearchable: v.isSearchable }))
            ))
            .catch((err: any) => setLoadError(err?.message ?? 'Failed to load custom properties.'))
            .finally(() => setLoading(false));
    }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its metadata.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Custom properties (metadata) are only available for containers.</p>;
    }

    async function removeProperty(key: string) {
        setRemovingKey(key);
        setRemoveError(null);
        try {
            await api.containers.deleteCustomProperty(item!.id, key);
            setProperties(prev => prev.filter(p => p.key !== key));
        } catch (err: any) {
            setRemoveError(err?.message ?? 'Failed to delete property.');
        } finally {
            setRemovingKey(null);
        }
    }

    async function confirmAdd() {
        if (!form.key.trim()) return;
        setAddBusy(true);
        setAddError(null);
        try {
            await api.containers.setCustomProperty(item!.id, form.key.trim(), form.value, form.isSearchable);
            setProperties(prev => [...prev, { key: form.key.trim(), value: form.value, isSearchable: form.isSearchable }]);
            setShowAdd(false);
        } catch (err: any) {
            setAddError(err?.message ?? 'Failed to add property.');
        } finally {
            setAddBusy(false);
        }
    }

    function openEdit(p: MetadataRow) {
        setEditError(null);
        setEditForm({ key: p.key, value: p.value ?? '', isSearchable: p.isSearchable ?? false });
        setEditingKey(p.key);
    }

    async function confirmEdit() {
        if (!editingKey) return;
        setEditBusy(true);
        setEditError(null);
        try {
            await api.containers.setCustomProperty(item!.id, editingKey, editForm.value, editForm.isSearchable);
            setProperties(prev => prev.map(p => p.key !== editingKey ? p : { ...p, value: editForm.value, isSearchable: editForm.isSearchable }));
            setEditingKey(null);
        } catch (err: any) {
            setEditError(err?.message ?? 'Failed to update property.');
        } finally {
            setEditBusy(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 8px' }}>
                {removeError && (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)', flex: 1 }}>{removeError}</p>
                )}
                <div style={{ flex: 1 }} />
                <button className="action-btn" onClick={() => { setForm(DEFAULT_FORM); setAddError(null); setShowAdd(true); }} disabled={loading}>
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', opacity: 0.6, fontSize: 12 }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                    Loading properties…
                </div>
            )}
            {loadError && (
                <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{loadError}</p>
            )}

            {!loading && !loadError && (properties.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>No custom properties defined.</p>
            ) : (
                <>
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
                        <span /><span />
                    </div>

                    {properties.map(p => (
                        <div key={p.key} style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr 20px 28px 28px',
                            alignItems: 'center', gap: 4,
                            padding: '6px 0',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            opacity: removingKey === p.key ? 0.4 : 1,
                        }}>
                            <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.key}
                            </span>
                            <span style={{ fontSize: 12, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.value ?? ''}
                            </span>
                            <span title={p.isSearchable ? 'Searchable' : 'Not searchable'}>
                                <span className="codicon codicon-search" style={{ fontSize: 12, opacity: (p.isSearchable ?? false) ? 0.85 : 0.2 }} />
                            </span>
                            <button
                                className="icon-btn" title="Edit" style={{ fontSize: 13, padding: '2px 4px' }}
                                onClick={() => openEdit(p)}
                                disabled={removingKey === p.key}
                            >
                                <span className="codicon codicon-edit" />
                            </button>
                            <button
                                className="icon-btn" title="Remove" style={{ fontSize: 13, padding: '2px 4px' }}
                                onClick={() => removeProperty(p.key)}
                                disabled={removingKey === p.key}
                            >
                                {removingKey === p.key
                                    ? <span className="codicon codicon-loading codicon-modifier-spin" />
                                    : <span className="codicon codicon-close" />
                                }
                            </button>
                        </div>
                    ))}
                </>
            ))}

            {showAdd && (
                <Modal
                    title="Add custom property"
                    confirmLabel={addBusy ? 'Adding…' : 'Add'}
                    confirmDisabled={!form.key.trim() || addBusy}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowAdd(false)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {addError && <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{addError}</p>}
                        <AddMetadataForm form={form} setForm={setForm} />
                    </div>
                </Modal>
            )}

            {editingKey !== null && (
                <Modal
                    title="Edit custom property"
                    confirmLabel={editBusy ? 'Saving…' : 'Save'}
                    confirmDisabled={editBusy}
                    onConfirm={confirmEdit}
                    onCancel={() => setEditingKey(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {editError && <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{editError}</p>}
                        <AddMetadataForm form={editForm} setForm={setEditForm} lockKey />
                    </div>
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

