import React, { useEffect, useState } from 'react';
import { ContainerColumn, DUMMY_CONTAINER_COLUMNS, DUMMY_ITEM_FIELDS } from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';

// ── Types ─────────────────────────────────────────────────────────────────────

type DriveItemFields = Record<string, string>;

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: 12,
    boxSizing: 'border-box',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
    borderRadius: 3,
    outline: 'none',
    fontFamily: 'var(--vscode-font-family)',
};

const SELECT: React.CSSProperties = {
    ...INPUT,
    background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
    color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
    border: '1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))',
};

const LBL: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.7,
    display: 'block',
    marginBottom: 4,
};

// ── Type-chip badge ───────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
    text: 'var(--vscode-symbolIcon-variableForeground, #9CDCFE)',
    boolean: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    dateTime: 'var(--vscode-symbolIcon-enumeratorForeground, #c8c8ff)',
    currency: 'var(--vscode-terminal-ansiGreen, #89d185)',
    choice: 'var(--vscode-symbolIcon-constructorForeground, #b8d7a3)',
    hyperlinkOrPicture: 'var(--vscode-terminal-ansiCyan, #29b8db)',
    number: 'var(--vscode-terminal-ansiYellow, #cca700)',
    personOrGroup: 'var(--vscode-symbolIcon-colorForeground, #d7ba7d)',
};

const TYPE_LABELS: Record<string, string> = {
    text: 'Text',
    boolean: 'Bool',
    dateTime: 'Date',
    currency: 'Currency',
    choice: 'Choice',
    hyperlinkOrPicture: 'Link',
    number: 'Number',
    personOrGroup: 'Person',
};

function TypeChip({ col }: { col: ContainerColumn }) {
    const color = TYPE_COLORS[col.columnType] ?? 'var(--vscode-foreground)';
    return (
        <span style={{
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            color,
            border: `1px solid ${color}50`,
        }}>
            {TYPE_LABELS[col.columnType] ?? col.columnType}
        </span>
    );
}

// ── Type-aware read-only value display ────────────────────────────────────────

function formatFieldValue(col: ContainerColumn, value: string): React.ReactNode {
    if (col.columnType === 'boolean') {
        const isTrue = value === 'true';
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span
                    className={`codicon ${isTrue ? 'codicon-check' : 'codicon-close'}`}
                    style={{ fontSize: 13, opacity: isTrue ? 0.9 : 0.35 }}
                />
                {isTrue ? 'Yes' : 'No'}
            </span>
        );
    }
    if (col.columnType === 'dateTime' && value) {
        try {
            return new Date(value + 'T00:00:00').toLocaleDateString();
        } catch {
            return value;
        }
    }
    if (col.columnType === 'currency' && value) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            return new Intl.NumberFormat(col.currencySettings?.locale ?? 'en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(num);
        }
    }
    if (col.columnType === 'hyperlinkOrPicture' && value) {
        return (
            <a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--vscode-textLink-foreground)', fontSize: 12 }}>
                {value}
            </a>
        );
    }
    return value || <span style={{ opacity: 0.3 }}>—</span>;
}

// ── Type-specific field value input ──────────────────────────────────────────

function FieldValueInput({ col, value, onChange }: {
    col: ContainerColumn;
    value: string;
    onChange: (v: string) => void;
}) {
    switch (col.columnType) {
        case 'boolean':
            return (
                <div style={{ display: 'flex', gap: 16, padding: '4px 0' }}>
                    {(['true', 'false'] as const).map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="boolField"
                                value={opt}
                                checked={value === opt}
                                onChange={() => onChange(opt)}
                            />
                            {opt === 'true' ? 'Yes / True' : 'No / False'}
                        </label>
                    ))}
                </div>
            );

        case 'choice': {
            const choices = col.choiceSettings?.choices ?? [];
            const allowFree = col.choiceSettings?.allowTextEntry ?? false;
            if (allowFree) {
                const isCustom = Boolean(value && !choices.includes(value));
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <select
                            style={SELECT}
                            value={isCustom ? '__custom__' : (value || '')}
                            onChange={e => {
                                if (e.target.value === '__custom__') onChange('');
                                else onChange(e.target.value);
                            }}
                        >
                            <option value="">— Select —</option>
                            {choices.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="__custom__">Custom value…</option>
                        </select>
                        {isCustom && (
                            <input
                                autoFocus
                                style={INPUT}
                                placeholder="Enter custom value"
                                value={value}
                                onChange={e => onChange(e.target.value)}
                            />
                        )}
                    </div>
                );
            }
            return (
                <select style={SELECT} value={value || ''} onChange={e => onChange(e.target.value)}>
                    <option value="">— Select —</option>
                    {choices.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            );
        }

        case 'dateTime':
            return (
                <input
                    type={col.dateTimeSettings?.format === 'dateTime' ? 'datetime-local' : 'date'}
                    style={INPUT}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );

        case 'currency':
            return (
                <input
                    type="number"
                    step="0.01"
                    style={INPUT}
                    placeholder="0.00"
                    min={0}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );

        case 'number': {
            const ns = col.numberSettings;
            return (
                <input
                    type="number"
                    style={INPUT}
                    placeholder="0"
                    step={ns?.decimalPlaces === 'none' ? '1' : 'any'}
                    min={ns?.minimum}
                    max={ns?.maximum}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );
        }

        case 'hyperlinkOrPicture':
            return (
                <input
                    type="url"
                    style={INPUT}
                    placeholder="https://…"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );

        case 'personOrGroup':
            return (
                <input
                    style={INPUT}
                    placeholder="user@example.com or display name"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );

        default: // text
            return (
                <input
                    style={INPUT}
                    placeholder="Enter value"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );
    }
}

// ── Add / Edit dialog ─────────────────────────────────────────────────────────

interface FieldDialogProps {
    /** Available columns (filtered to unset ones when adding) */
    columns: ContainerColumn[];
    initialColumnId: string;
    initialValue: string;
    isEdit: boolean;
    onConfirm: (columnId: string, value: string) => void;
    onCancel: () => void;
}

function FieldDialog({ columns, initialColumnId, initialValue, isEdit, onConfirm, onCancel }: FieldDialogProps) {
    const [selectedId, setSelectedId] = useState(initialColumnId || (columns[0]?.id ?? ''));
    const [value, setValue] = useState(initialValue);

    const selectedCol = columns.find(c => c.id === selectedId) ?? columns[0];

    function handleColumnChange(newId: string) {
        setSelectedId(newId);
        if (!isEdit) setValue('');   // reset value when picking a different column
    }

    // boolean and choice require a non-empty selection to confirm
    const canConfirm = !!selectedCol && (
        selectedCol.columnType === 'boolean' || selectedCol.columnType === 'choice'
            ? value !== ''
            : true
    );

    return (
        <Modal
            title={isEdit ? `Edit "${selectedCol?.displayName ?? ''}"` : 'Set field'}
            confirmLabel={isEdit ? 'Save' : 'Set'}
            confirmDisabled={!canConfirm}
            onConfirm={() => { if (selectedId) onConfirm(selectedId, value); }}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Column selector — locked while editing, editable while adding */}
                {isEdit ? (
                    <div>
                        <label style={LBL}>Column</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {selectedCol?.displayName}
                            </span>
                            {selectedCol && <TypeChip col={selectedCol} />}
                        </div>
                        {selectedCol?.description && (
                            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>
                                {selectedCol.description}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <label style={LBL}>
                            Column <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                        </label>
                        <select
                            style={SELECT}
                            value={selectedId}
                            onChange={e => handleColumnChange(e.target.value)}
                        >
                            {columns.map(c => (
                                <option key={c.id} value={c.id}>{c.displayName}</option>
                            ))}
                        </select>
                        {selectedCol?.description && (
                            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>
                                {selectedCol.description}
                            </div>
                        )}
                    </div>
                )}

                {/* Value input — type-aware */}
                {selectedCol && (
                    <div>
                        <label style={LBL}>
                            Value{' '}
                            {selectedCol.columnType !== 'boolean' && (
                                <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                            )}
                        </label>
                        <FieldValueInput col={selectedCol} value={value} onChange={setValue} />
                    </div>
                )}

            </div>
        </Modal>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const ALL_COLUMNS = DUMMY_CONTAINER_COLUMNS;

export function FileMetadataPanel({ item }: { item: StorageItem | null }) {
    const [fields, setFields] = useState<DriveItemFields>(() =>
        item?.id ? { ...(DUMMY_ITEM_FIELDS[item.id] ?? {}) } : {}
    );
    const [showAdd, setShowAdd] = useState(false);
    const [editingColName, setEditingColName] = useState<string | null>(null);

    // Sync fields when the selected item changes
    useEffect(() => {
        setFields(item?.id ? { ...(DUMMY_ITEM_FIELDS[item.id] ?? {}) } : {});
        setShowAdd(false);
        setEditingColName(null);
    }, [item?.id]);

    if (!item) {
        return (
            <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>
                Select a file or folder to view its fields.
            </p>
        );
    }

    if (item.kind === 'container') {
        return (
            <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>
                Use the Metadata tab for container-level properties.
            </p>
        );
    }

    const setFieldNames = Object.keys(fields);
    const unsetColumns = ALL_COLUMNS.filter(c => !setFieldNames.includes(c.name));
    const colByName = (name: string) => ALL_COLUMNS.find(c => c.name === name);

    function handleSetField(columnId: string, value: string) {
        const col = ALL_COLUMNS.find(c => c.id === columnId);
        if (!col) return;
        setFields(prev => ({ ...prev, [col.name]: value }));
        setShowAdd(false);
        setEditingColName(null);
    }

    function removeField(colName: string) {
        setFields(prev => {
            const next = { ...prev };
            delete next[colName];
            return next;
        });
    }

    const fieldEntries = Object.entries(fields);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 10px' }}>
                <button
                    className="action-btn"
                    disabled={unsetColumns.length === 0}
                    title={unsetColumns.length === 0 ? 'All columns already have values' : 'Set a field value from a column'}
                    onClick={() => setShowAdd(true)}
                >
                    <span className="codicon codicon-add" />
                    Set field
                </button>
            </div>

            {/* Empty state */}
            {fieldEntries.length === 0 && (
                <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>
                    No fields set. Use "Set field" to add values from the container's columns.
                </p>
            )}

            {/* Field rows */}
            {fieldEntries.map(([colName, value]) => {
                const col = colByName(colName);
                return (
                    <div
                        key={colName}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 0',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>
                                    {col?.displayName ?? colName}
                                </span>
                                {col && <TypeChip col={col} />}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.85, wordBreak: 'break-all' }}>
                                {col ? formatFieldValue(col, value) : value}
                            </div>
                        </div>
                        <button
                            className="icon-btn"
                            title="Edit"
                            style={{ fontSize: 13, flexShrink: 0 }}
                            onClick={() => setEditingColName(colName)}
                        >
                            <span className="codicon codicon-edit" />
                        </button>
                        <button
                            className="icon-btn"
                            title="Remove"
                            style={{ fontSize: 13, flexShrink: 0 }}
                            onClick={() => removeField(colName)}
                        >
                            <span className="codicon codicon-close" />
                        </button>
                    </div>
                );
            })}

            {/* Add dialog */}
            {showAdd && unsetColumns.length > 0 && (
                <FieldDialog
                    columns={unsetColumns}
                    initialColumnId={unsetColumns[0].id}
                    initialValue=""
                    isEdit={false}
                    onConfirm={handleSetField}
                    onCancel={() => setShowAdd(false)}
                />
            )}

            {/* Edit dialog */}
            {editingColName !== null && (() => {
                const col = colByName(editingColName);
                if (!col) return null;
                return (
                    <FieldDialog
                        columns={ALL_COLUMNS}
                        initialColumnId={col.id}
                        initialValue={fields[editingColName] ?? ''}
                        isEdit={true}
                        onConfirm={handleSetField}
                        onCancel={() => setEditingColName(null)}
                    />
                );
            })()}

        </div>
    );
}
