import React, { useState, useEffect } from 'react';
import type { ColumnDefinition } from '@microsoft/microsoft-graph-types';
import { ColumnTypeName, getColumnTypeName } from '../../models/spe';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

const COLUMN_TYPE_LABELS: Record<ColumnTypeName, string> = {
    text: 'Text',
    boolean: 'Boolean',
    dateTime: 'Date/Time',
    currency: 'Currency',
    choice: 'Choice',
    hyperlinkOrPicture: 'Hyperlink/Picture',
    number: 'Number',
    personOrGroup: 'Person/Group',
};

const COLUMN_TYPE_COLORS: Record<ColumnTypeName, string> = {
    text:                'var(--vscode-symbolIcon-variableForeground, #9CDCFE)',
    boolean:             'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    dateTime:            'var(--vscode-symbolIcon-enumeratorForeground, #c8c8ff)',
    currency:            'var(--vscode-terminal-ansiGreen, #89d185)',
    choice:              'var(--vscode-symbolIcon-constructorForeground, #b8d7a3)',
    hyperlinkOrPicture:  'var(--vscode-terminal-ansiCyan, #29b8db)',
    number:              'var(--vscode-terminal-ansiYellow, #cca700)',
    personOrGroup:       'var(--vscode-symbolIcon-colorForeground, #d7ba7d)',
};

const ALL_TYPES = Object.keys(COLUMN_TYPE_LABELS) as ColumnTypeName[];

// ── Per-type setting shapes ───────────────────────────────────────────────
interface TextSettings { allowMultipleLines: boolean; }
interface DateTimeSettings { format: 'dateOnly' | 'dateTime'; }
interface CurrencySettings { locale: string; }
interface ChoiceSettings { allowTextEntry: boolean; choices: string[]; }
interface NumberSettings { decimalPlaces: 'automatic' | 'none' | 'one' | 'two' | 'three' | 'four' | 'five'; maximum: string; minimum: string; }
interface PersonOrGroupSettings { allowMultipleSelection: boolean; chooseFromType: 'peopleAndGroups' | 'peopleOnly'; }

interface AddColumnState {
    name: string;
    description: string;
    columnType: ColumnTypeName;
    indexed: boolean;
    text: TextSettings;
    dateTime: DateTimeSettings;
    currency: CurrencySettings;
    choice: ChoiceSettings;
    number: NumberSettings;
    personOrGroup: PersonOrGroupSettings;
}

const DEFAULT_ADD: AddColumnState = {
    name: '', description: '', columnType: 'text', indexed: true,
    text: { allowMultipleLines: false },
    dateTime: { format: 'dateTime' },
    currency: { locale: 'en-us' },
    choice: { allowTextEntry: false, choices: [] },
    number: { decimalPlaces: 'automatic', maximum: '', minimum: '' },
    personOrGroup: { allowMultipleSelection: false, chooseFromType: 'peopleAndGroups' },
};

export function ColumnsPanel({ item }: { item: StorageItem | null }) {
    const { api } = useStorageExplorer();

    const [columns, setColumns] = useState<ColumnDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState<AddColumnState>(DEFAULT_ADD);
    const [addBusy, setAddBusy] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<AddColumnState>(DEFAULT_ADD);
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [removingId, setRemovingId] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);

    useEffect(() => {
        if (!item || item.kind !== 'container') return;
        setLoading(true);
        setLoadError(null);
        api.columns.listContainerColumns(item.id)
            .then(cols => setColumns(cols))
            .catch((err: any) => setLoadError(err?.message ?? 'Failed to load columns.'))
            .finally(() => setLoading(false));
    }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its columns.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Columns are only configurable on containers.</p>;
    }

    async function removeColumn(id: string) {
        setRemovingId(id);
        setRemoveError(null);
        try {
            await api.columns.deleteContainerColumn(item!.id, id);
            setColumns(prev => prev.filter(c => c.id !== id));
        } catch (err: any) {
            setRemoveError(err?.message ?? 'Failed to delete column.');
        } finally {
            setRemovingId(null);
        }
    }

    async function confirmAdd() {
        if (!form.name.trim()) return;
        setAddBusy(true);
        setAddError(null);
        try {
            const colDef = buildColumnDefinition(form);
            const created = await api.columns.createContainerColumn(item!.id, colDef);
            setColumns(prev => [...prev, created]);
            setShowAdd(false);
        } catch (err: any) {
            setAddError(err?.message ?? 'Failed to create column.');
        } finally {
            setAddBusy(false);
        }
    }

    function openEdit(col: ColumnDefinition) {
        setEditError(null);
        setEditForm({
            ...DEFAULT_ADD,
            name: col.displayName ?? '',
            description: col.description ?? '',
            indexed: col.indexed ?? true,
            columnType: getColumnTypeName(col),
            text: {
                allowMultipleLines: col.text?.allowMultipleLines ?? false,
            },
            dateTime: {
                format: (col.dateTime?.format as DateTimeSettings['format']) ?? 'dateTime',
            },
            currency: {
                locale: (col.currency as any)?.locale ?? 'en-us',
            },
            choice: {
                allowTextEntry: col.choice?.allowTextEntry ?? false,
                choices: col.choice?.choices ?? [],
            },
            number: {
                decimalPlaces: (col.number?.decimalPlaces as NumberSettings['decimalPlaces']) ?? 'automatic',
                minimum: col.number?.minimum != null ? String(col.number.minimum) : '',
                maximum: col.number?.maximum != null ? String(col.number.maximum) : '',
            },
            personOrGroup: {
                allowMultipleSelection: col.personOrGroup?.allowMultipleSelection ?? false,
                chooseFromType: (col.personOrGroup?.chooseFromType as PersonOrGroupSettings['chooseFromType']) ?? 'peopleAndGroups',
            },
        });
        setEditingId(col.id ?? '');
    }

    async function confirmEdit() {
        if (!editForm.name.trim() || !editingId) return;
        setEditBusy(true);
        setEditError(null);
        try {
            const full = buildColumnDefinition(editForm);
            // Don't send name/enforceUniqueValues/hidden on updates — only mutable fields
            const { name: _n, enforceUniqueValues: _e, hidden: _h, ...patch } = full;
            const updated = await api.columns.updateContainerColumn(item!.id, editingId, patch);
            setColumns(prev => prev.map(c => c.id === editingId ? { ...c, ...updated } : c));
            setEditingId(null);
        } catch (err: any) {
            setEditError(err?.message ?? 'Failed to update column.');
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
                <button className="action-btn" onClick={() => { setForm(DEFAULT_ADD); setAddError(null); setShowAdd(true); }} disabled={loading}>
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', opacity: 0.6, fontSize: 12 }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                    Loading columns…
                </div>
            )}
            {loadError && (
                <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{loadError}</p>
            )}

            {!loading && !loadError && (() => {
                const custom  = columns.filter(c => c.isDeletable !== false);
                const builtin = columns.filter(c => c.isDeletable === false);

                return (
                    <>
                        {custom.length === 0 && builtin.length === 0 && (
                            <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>No columns defined.</p>
                        )}

                        {/* Custom (deletable) columns */}
                        {custom.map(col => (
                            <div key={col.id ?? ''} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                padding: '7px 0',
                                borderBottom: '1px solid var(--vscode-panel-border)',
                                opacity: removingId === col.id ? 0.4 : 1,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>{col.displayName ?? ''}</span>
                                        <span style={{
                                            fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                            border: `1px solid ${COLUMN_TYPE_COLORS[getColumnTypeName(col)]}50`,
                                            color: COLUMN_TYPE_COLORS[getColumnTypeName(col)],
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {COLUMN_TYPE_LABELS[getColumnTypeName(col)]}
                                        </span>
                                        {(col.indexed ?? false) && (
                                            <span title="Indexed — searchable">
                                                <span className="codicon codicon-search" style={{ fontSize: 11, opacity: 0.65 }} />
                                            </span>
                                        )}
                                        {(col.hidden ?? false) && (
                                            <span title="Hidden">
                                                <span className="codicon codicon-eye-closed" style={{ fontSize: 11, opacity: 0.65 }} />
                                            </span>
                                        )}
                                    </div>
                                    {col.description && (
                                        <div style={{
                                            fontSize: 11, opacity: 0.55, marginTop: 2,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {col.description}
                                        </div>
                                    )}
                                </div>
                                <button
                                    className="icon-btn" title="Edit column" style={{ fontSize: 13, flexShrink: 0 }}
                                    onClick={() => openEdit(col)}
                                    disabled={removingId === col.id}
                                >
                                    <span className="codicon codicon-edit" />
                                </button>
                                <button
                                    className="icon-btn" title="Remove column" style={{ fontSize: 13, flexShrink: 0 }}
                                    onClick={() => removeColumn(col.id ?? '')}
                                    disabled={removingId === col.id}
                                >
                                    {removingId === col.id
                                        ? <span className="codicon codicon-loading codicon-modifier-spin" />
                                        : <span className="codicon codicon-close" />
                                    }
                                </button>
                            </div>
                        ))}

                        {/* Built-in (non-deletable) columns */}
                        {builtin.length > 0 && (
                            <>
                                <div style={{
                                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                    letterSpacing: '0.05em', opacity: 0.45, padding: '10px 0 2px',
                                }}>
                                    Built-in
                                </div>
                                {builtin.map(col => (
                                    <div key={col.id ?? ''} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 8,
                                        padding: '7px 0',
                                        borderBottom: '1px solid var(--vscode-panel-border)',
                                        opacity: 0.55,
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 12, fontWeight: 600 }}>{col.displayName ?? ''}</span>
                                                <span style={{
                                                    fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                                    border: `1px solid ${COLUMN_TYPE_COLORS[getColumnTypeName(col)]}50`,
                                                    color: COLUMN_TYPE_COLORS[getColumnTypeName(col)],
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {COLUMN_TYPE_LABELS[getColumnTypeName(col)]}
                                                </span>
                                                {(col.indexed ?? false) && (
                                                    <span title="Indexed — searchable">
                                                        <span className="codicon codicon-search" style={{ fontSize: 11, opacity: 0.65 }} />
                                                    </span>
                                                )}
                                                {(col.hidden ?? false) && (
                                                    <span title="Hidden">
                                                        <span className="codicon codicon-eye-closed" style={{ fontSize: 11, opacity: 0.65 }} />
                                                    </span>
                                                )}
                                            </div>
                                            {col.description && (
                                                <div style={{
                                                    fontSize: 11, opacity: 0.55, marginTop: 2,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {col.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </>
                );
            })()}

            {showAdd && (
                <Modal
                    title="Add column"
                    confirmLabel={addBusy ? 'Adding…' : 'Add'}
                    confirmDisabled={!form.name.trim() || addBusy}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowAdd(false)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {addError && <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{addError}</p>}
                        <AddColumnForm form={form} setForm={setForm} />
                    </div>
                </Modal>
            )}

            {editingId !== null && (
                <Modal
                    title="Edit column"
                    confirmLabel={editBusy ? 'Saving…' : 'Save'}
                    confirmDisabled={!editForm.name.trim() || editBusy}
                    onConfirm={confirmEdit}
                    onCancel={() => setEditingId(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {editError && <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{editError}</p>}
                        <AddColumnForm form={editForm} setForm={setEditForm} lockType />
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ── Build a ColumnDefinition payload from the form state ──────────────────────
function buildColumnDefinition(form: AddColumnState): Partial<ColumnDefinition> {
    const base: Partial<ColumnDefinition> = {
        name: form.name.trim().replace(/\s+/g, '_'),
        displayName: form.name.trim(),
        description: form.description.trim() || undefined,
        enforceUniqueValues: false,
        hidden: false,
        indexed: form.indexed,
    };
    switch (form.columnType) {
        case 'boolean':            return { ...base, boolean: {} };
        case 'text':               return { ...base, text: { allowMultipleLines: form.text.allowMultipleLines } };
        case 'dateTime':           return { ...base, dateTime: { format: form.dateTime.format } };
        case 'currency':           return { ...base, currency: { locale: form.currency.locale } };
        case 'choice':             return { ...base, choice: { choices: form.choice.choices.filter(Boolean), allowTextEntry: form.choice.allowTextEntry } };
        case 'hyperlinkOrPicture': return { ...base, hyperlinkOrPicture: {} };
        case 'number':             return { ...base, number: { decimalPlaces: form.number.decimalPlaces, minimum: form.number.minimum ? parseFloat(form.number.minimum) : undefined, maximum: form.number.maximum ? parseFloat(form.number.maximum) : undefined } };
        case 'personOrGroup':      return { ...base, personOrGroup: { allowMultipleSelection: form.personOrGroup.allowMultipleSelection, chooseFromType: form.personOrGroup.chooseFromType } };
        default:                   return { ...base, text: {} };
    }
}

function AddColumnForm({
    form,
    setForm,
    lockType = false,
}: {
    form: AddColumnState;
    setForm: React.Dispatch<React.SetStateAction<AddColumnState>>;
    lockType?: boolean;
}) {
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '5px 8px', fontSize: 12,
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
        borderRadius: 3, outline: 'none',
        fontFamily: 'var(--vscode-font-family)',
    };
    const selectStyle: React.CSSProperties = {
        ...inputStyle,
        background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
        color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
        border: '1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))',
    };
    const labelStyle: React.CSSProperties = { fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 };
    const checkLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Name */}
            <div>
                <label style={labelStyle}>Name <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span></label>
                <input autoFocus style={inputStyle} placeholder="e.g. Project Code"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Description */}
            <div>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} placeholder="Optional description"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            {/* Type */}
            <div>
                <label style={labelStyle}>Type</label>
                {lockType ? (
                    <div style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed', userSelect: 'none' }}>
                        {COLUMN_TYPE_LABELS[form.columnType]}
                    </div>
                ) : (
                    <select value={form.columnType} style={selectStyle}
                        onChange={e => setForm(f => ({ ...f, columnType: e.target.value as ColumnTypeName }))}>
                        {ALL_TYPES.map(t => <option key={t} value={t}>{COLUMN_TYPE_LABELS[t]}</option>)}
                    </select>
                )}
            </div>

            {/* Type-specific settings */}
            <TypeSettingsSection form={form} setForm={setForm} inputStyle={inputStyle} selectStyle={selectStyle} labelStyle={labelStyle} checkLabel={checkLabel} />

            {/* Indexed */}
            <label style={checkLabel}>
                <input type="checkbox" checked={form.indexed}
                    onChange={e => setForm(f => ({ ...f, indexed: e.target.checked }))} />
                Indexed (enables search by this column)
            </label>
        </div>
    );
}

function TypeSettingsSection({
    form, setForm, inputStyle, selectStyle, labelStyle, checkLabel,
}: {
    form: AddColumnState;
    setForm: React.Dispatch<React.SetStateAction<AddColumnState>>;
    inputStyle: React.CSSProperties;
    selectStyle: React.CSSProperties;
    labelStyle: React.CSSProperties;
    checkLabel: React.CSSProperties;
}) {
    const upd = <K extends keyof AddColumnState>(key: K, patch: Partial<AddColumnState[K] & object>) =>
        setForm(f => ({ ...f, [key]: { ...(f[key] as object), ...patch } }));

    if (form.columnType === 'boolean') {
        return <div style={{ fontSize: 12, opacity: 0.45, fontStyle: 'italic' }}>No additional settings.</div>;
    }

    if (form.columnType === 'text') {
        const s = form.text;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <label style={checkLabel}>
                    <input type="checkbox" checked={s.allowMultipleLines} onChange={e => upd('text', { allowMultipleLines: e.target.checked })} />
                    Allow multiple lines
                </label>

            </div>
        );
    }

    if (form.columnType === 'dateTime') {
        const s = form.dateTime;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <div>
                    <label style={labelStyle}>Format</label>
                    {(['dateOnly', 'dateTime'] as const).map(v => (
                        <label key={v} style={{ ...checkLabel, marginBottom: 4 }}>
                            <input type="radio" name="dtFormat" value={v} checked={s.format === v} onChange={() => upd('dateTime', { format: v })} />
                            {v === 'dateOnly' ? 'Date only' : 'Date and time'}
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    if (form.columnType === 'currency') {
        const s = form.currency;
        return (
            <div style={{ padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <label style={labelStyle}>Locale</label>
                <input style={inputStyle} placeholder="e.g. en-us" value={s.locale}
                    onChange={e => upd('currency', { locale: e.target.value })} />
            </div>
        );
    }

    if (form.columnType === 'choice') {
        const s = form.choice;
        const MAX_CHOICES = 10;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <label style={checkLabel}>
                    <input type="checkbox" checked={s.allowTextEntry} onChange={e => upd('choice', { allowTextEntry: e.target.checked })} />
                    Allow custom text entry
                </label>
                <div>
                    <label style={{ ...labelStyle, marginBottom: 6 }}>Choices ({s.choices.length}/{MAX_CHOICES})</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.choices.map((choice, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 4 }}>
                                <input
                                    style={{ ...inputStyle, flex: 1 }}
                                    value={choice}
                                    placeholder={`Choice ${idx + 1}`}
                                    onChange={e => {
                                        const next = [...s.choices];
                                        next[idx] = e.target.value;
                                        upd('choice', { choices: next });
                                    }}
                                />
                                <button
                                    className="icon-btn" title="Remove choice" style={{ fontSize: 13, flexShrink: 0 }}
                                    onClick={() => upd('choice', { choices: s.choices.filter((_, i) => i !== idx) })}
                                >
                                    <span className="codicon codicon-close" />
                                </button>
                            </div>
                        ))}
                    </div>
                    {s.choices.length < MAX_CHOICES && (
                        <button
                            className="action-btn"
                            style={{ marginTop: 6, padding: '3px 0' }}
                            onClick={() => upd('choice', { choices: [...s.choices, ''] })}
                        >
                            <span className="codicon codicon-add" />
                            Add choice
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (form.columnType === 'hyperlinkOrPicture') {
        return <div style={{ fontSize: 12, opacity: 0.45, fontStyle: 'italic' }}>No additional settings.</div>;
    }

    if (form.columnType === 'number') {
        const s = form.number;
        const decimalOptions = ['automatic', 'none', 'one', 'two', 'three', 'four', 'five'] as const;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <div>
                    <label style={labelStyle}>Decimal places</label>
                    <select value={s.decimalPlaces} style={selectStyle}
                        onChange={e => upd('number', { decimalPlaces: e.target.value as typeof s.decimalPlaces })}>
                        {decimalOptions.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                        <label style={labelStyle}>Minimum</label>
                        <input type="number" style={inputStyle} placeholder="None" value={s.minimum}
                            onChange={e => upd('number', { minimum: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>Maximum</label>
                        <input type="number" style={inputStyle} placeholder="None" value={s.maximum}
                            onChange={e => upd('number', { maximum: e.target.value })} />
                    </div>
                </div>
            </div>
        );
    }

    if (form.columnType === 'personOrGroup') {
        const s = form.personOrGroup;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <label style={checkLabel}>
                    <input type="checkbox" checked={s.allowMultipleSelection} onChange={e => upd('personOrGroup', { allowMultipleSelection: e.target.checked })} />
                    Allow multiple selection
                </label>
                <div>
                    <label style={labelStyle}>Choose from</label>
                    {([['peopleAndGroups', 'People and groups'], ['peopleOnly', 'People only']] as const).map(([v, lbl]) => (
                        <label key={v} style={{ ...checkLabel, marginBottom: 4 }}>
                            <input type="radio" name="pogType" value={v} checked={s.chooseFromType === v} onChange={() => upd('personOrGroup', { chooseFromType: v })} />
                            {lbl}
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    return null;
}
