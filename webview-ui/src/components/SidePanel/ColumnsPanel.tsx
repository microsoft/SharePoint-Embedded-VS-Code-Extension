import React, { useState } from 'react';
import { DUMMY_CONTAINER_COLUMNS, ContainerColumn, ColumnTypeName } from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';

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
interface TextSettings { allowMultipleLines: boolean; appendChangesToExistingText: boolean; linesForEditing: number; maxLength: number; }
interface DateTimeSettings { displayAs: 'default' | 'friendly' | 'standard'; format: 'dateOnly' | 'dateTime'; }
interface CurrencySettings { locale: string; }
interface ChoiceSettings { allowTextEntry: boolean; choices: string[]; }
interface HyperlinkSettings { isPicture: boolean; }
interface NumberSettings { decimalPlaces: 'automatic' | 'none' | 'one' | 'two' | 'three' | 'four' | 'five'; displayAs: 'number' | 'percentage'; maximum: string; minimum: string; }
interface PersonOrGroupSettings { allowMultipleSelection: boolean; displayAs: string; chooseFromType: 'peopleAndGroups' | 'peopleOnly'; }

interface AddColumnState {
    name: string;
    description: string;
    columnType: ColumnTypeName;
    indexed: boolean;
    text: TextSettings;
    dateTime: DateTimeSettings;
    currency: CurrencySettings;
    choice: ChoiceSettings;
    hyperlinkOrPicture: HyperlinkSettings;
    number: NumberSettings;
    personOrGroup: PersonOrGroupSettings;
}

const DEFAULT_ADD: AddColumnState = {
    name: '', description: '', columnType: 'text', indexed: true,
    text: { allowMultipleLines: false, appendChangesToExistingText: false, linesForEditing: 0, maxLength: 255 },
    dateTime: { displayAs: 'default', format: 'dateTime' },
    currency: { locale: 'en-us' },
    choice: { allowTextEntry: false, choices: [] },
    hyperlinkOrPicture: { isPicture: false },
    number: { decimalPlaces: 'automatic', displayAs: 'number', maximum: '', minimum: '' },
    personOrGroup: { allowMultipleSelection: false, displayAs: 'account', chooseFromType: 'peopleAndGroups' },
};

export function ColumnsPanel({ item }: { item: StorageItem | null }) {
    const [columns, setColumns] = useState<ContainerColumn[]>([...DUMMY_CONTAINER_COLUMNS]);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState<AddColumnState>(DEFAULT_ADD);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<AddColumnState>(DEFAULT_ADD);

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its columns.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Columns are only configurable on containers.</p>;
    }

    function removeColumn(id: string) {
        setColumns(prev => prev.filter(c => c.id !== id));
    }

    function confirmAdd() {
        if (!form.name.trim()) return;
        const newCol: ContainerColumn = {
            id: `col-${Date.now()}`,
            name: form.name.trim().replace(/\s+/g, ''),
            displayName: form.name.trim(),
            description: form.description.trim(),
            enforceUniqueValues: false,
            hidden: false,
            indexed: form.indexed,
            columnType: form.columnType,
        };
        setColumns(prev => [...prev, newCol]);
        setShowAdd(false);
    }

    function openEdit(col: ContainerColumn) {
        setEditForm({ ...DEFAULT_ADD, name: col.displayName, description: col.description, indexed: col.indexed, columnType: col.columnType });
        setEditingId(col.id);
    }

    function confirmEdit() {
        if (!editForm.name.trim() || !editingId) return;
        setColumns(prev => prev.map(c => c.id !== editingId ? c : {
            ...c,
            name: editForm.name.trim().replace(/\s+/g, ''),
            displayName: editForm.name.trim(),
            description: editForm.description.trim(),
            indexed: editForm.indexed,
        }));
        setEditingId(null);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
                <button className="action-btn" onClick={() => { setForm(DEFAULT_ADD); setShowAdd(true); }}>
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {columns.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>No columns defined.</p>
            ) : (
                columns.map(col => (
                    <div key={col.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '7px 0',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                    }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Name + type badge + flags */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{col.displayName}</span>
                                <span style={{
                                    fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                    border: `1px solid ${COLUMN_TYPE_COLORS[col.columnType]}50`,
                                    color: COLUMN_TYPE_COLORS[col.columnType],
                                    whiteSpace: 'nowrap',
                                }}>
                                    {COLUMN_TYPE_LABELS[col.columnType]}
                                </span>
                                {col.indexed && (
                                    <span title="Indexed — searchable">
                                        <span className="codicon codicon-search" style={{ fontSize: 11, opacity: 0.65 }} />
                                    </span>
                                )}
                                {col.hidden && (
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
                        >
                            <span className="codicon codicon-edit" />
                        </button>
                        <button
                            className="icon-btn" title="Remove column" style={{ fontSize: 13, flexShrink: 0 }}
                            onClick={() => removeColumn(col.id)}
                        >
                            <span className="codicon codicon-close" />
                        </button>
                    </div>
                ))
            )}

            {showAdd && (
                <Modal
                    title="Add column"
                    confirmLabel="Add"
                    confirmDisabled={!form.name.trim()}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowAdd(false)}
                >
                    <AddColumnForm form={form} setForm={setForm} />
                </Modal>
            )}

            {editingId !== null && (
                <Modal
                    title="Edit column"
                    confirmLabel="Save"
                    confirmDisabled={!editForm.name.trim()}
                    onConfirm={confirmEdit}
                    onCancel={() => setEditingId(null)}
                >
                    <AddColumnForm form={editForm} setForm={setEditForm} lockType />
                </Modal>
            )}
        </div>
    );
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
                {s.allowMultipleLines && (
                    <>
                        <label style={checkLabel}>
                            <input type="checkbox" checked={s.appendChangesToExistingText} onChange={e => upd('text', { appendChangesToExistingText: e.target.checked })} />
                            Append changes to existing text
                        </label>
                        <div>
                            <label style={labelStyle}>Lines for editing</label>
                            <input type="number" min={0} style={inputStyle} value={s.linesForEditing}
                                onChange={e => upd('text', { linesForEditing: parseInt(e.target.value) || 0 })} />
                        </div>
                    </>
                )}
                <div>
                    <label style={labelStyle}>Max length (characters)</label>
                    <input type="number" min={1} max={255} style={inputStyle} value={s.maxLength}
                        onChange={e => upd('text', { maxLength: Math.min(255, parseInt(e.target.value) || 1) })} />
                </div>
            </div>
        );
    }

    if (form.columnType === 'dateTime') {
        const s = form.dateTime;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <div>
                    <label style={labelStyle}>Display as</label>
                    {(['default', 'friendly', 'standard'] as const).map(v => (
                        <label key={v} style={{ ...checkLabel, marginBottom: 4 }}>
                            <input type="radio" name="dtDisplayAs" value={v} checked={s.displayAs === v} onChange={() => upd('dateTime', { displayAs: v })} />
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                        </label>
                    ))}
                </div>
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
        const s = form.hyperlinkOrPicture;
        return (
            <div style={{ padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <label style={labelStyle}>Format</label>
                {[{ value: false, label: 'Hyperlink' }, { value: true, label: 'Picture' }].map(opt => (
                    <label key={String(opt.value)} style={{ ...checkLabel, marginBottom: 4 }}>
                        <input type="radio" name="hlFormat" checked={s.isPicture === opt.value} onChange={() => upd('hyperlinkOrPicture', { isPicture: opt.value })} />
                        {opt.label}
                    </label>
                ))}
            </div>
        );
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
                <div>
                    <label style={labelStyle}>Display as</label>
                    {(['number', 'percentage'] as const).map(v => (
                        <label key={v} style={{ ...checkLabel, marginBottom: 4 }}>
                            <input type="radio" name="numDisplayAs" value={v} checked={s.displayAs === v} onChange={() => upd('number', { displayAs: v })} />
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                        </label>
                    ))}
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
        const displayAsOptions = ['account', 'contentType', 'created', 'department', 'email', 'jobTitle', 'organization', 'title'];
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))', borderRadius: 4 }}>
                <label style={checkLabel}>
                    <input type="checkbox" checked={s.allowMultipleSelection} onChange={e => upd('personOrGroup', { allowMultipleSelection: e.target.checked })} />
                    Allow multiple selection
                </label>
                <div>
                    <label style={labelStyle}>Display as</label>
                    <select value={s.displayAs} style={selectStyle}
                        onChange={e => upd('personOrGroup', { displayAs: e.target.value })}>
                        {displayAsOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
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
