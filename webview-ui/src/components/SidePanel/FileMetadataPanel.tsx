import React, { useEffect, useState } from 'react';
import type { ColumnDefinition } from '@microsoft/microsoft-graph-types';
import { getColumnTypeName } from '../../models/spe';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

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

function TypeChip({ col }: { col: ColumnDefinition }) {
    const typeName = getColumnTypeName(col);
    const color = TYPE_COLORS[typeName] ?? 'var(--vscode-foreground)';
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
            {TYPE_LABELS[typeName] ?? typeName}
        </span>
    );
}

// ── Type-aware read-only value display ────────────────────────────────────────

function formatFieldValue(col: ColumnDefinition, value: string): React.ReactNode {
    const colType = getColumnTypeName(col);
    if (colType === 'boolean') {
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
    if (colType === 'dateTime' && value) {
        try {
            return new Date(value + 'T00:00:00').toLocaleDateString();
        } catch {
            return value;
        }
    }
    if (colType === 'currency' && value) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            return new Intl.NumberFormat(col.currency?.locale ?? 'en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(num);
        }
    }
    if (colType === 'hyperlinkOrPicture' && value) {
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
    col: ColumnDefinition;
    value: string;
    onChange: (v: string) => void;
}) {
    switch (getColumnTypeName(col)) {
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
            const choices = col.choice?.choices ?? [];
            const allowFree = col.choice?.allowTextEntry ?? false;
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
                    type={col.dateTime?.format === 'dateTime' ? 'datetime-local' : 'date'}
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
            return (
                <input
                    type="number"
                    style={INPUT}
                    placeholder="0"
                    step={col.number?.decimalPlaces === 'none' ? '1' : 'any'}
                    min={col.number?.minimum ?? undefined}
                    max={col.number?.maximum ?? undefined}
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
    columns: ColumnDefinition[];
    initialColumnId: string;
    initialValue: string;
    isEdit: boolean;
    onConfirm: (columnId: string, value: string) => Promise<void>;
    onCancel: () => void;
}

function FieldDialog({ columns, initialColumnId, initialValue, isEdit, onConfirm, onCancel }: FieldDialogProps) {
    const [selectedId, setSelectedId] = useState(initialColumnId || (columns[0]?.id ?? ''));
    const [value, setValue] = useState(initialValue);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedCol = columns.find(c => c.id === selectedId) ?? columns[0];

    function handleColumnChange(newId: string) {
        setSelectedId(newId);
        if (!isEdit) setValue('');   // reset value when picking a different column
    }

    // boolean and choice require a non-empty selection to confirm
    const colType = selectedCol ? getColumnTypeName(selectedCol) : 'text';
    const canConfirm = !!selectedCol && (
        colType === 'boolean' || colType === 'choice'
            ? value !== ''
            : true
    );

    async function handleConfirm() {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            await onConfirm(selectedId, value);
        } catch (err: any) {
            setError(err?.message ?? 'Failed to save.');
            setBusy(false);
        }
    }

    return (
        <Modal
            title={isEdit ? `Edit "${selectedCol?.displayName ?? ''}"` : 'Set field'}
            confirmLabel={isEdit ? 'Save' : 'Set'}
            confirmDisabled={!canConfirm || busy}
            onConfirm={handleConfirm}
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
                                <option key={c.id ?? ''} value={c.id ?? ''}>{c.displayName ?? ''}</option>
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
                            {getColumnTypeName(selectedCol) !== 'boolean' && (
                                <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                            )}
                        </label>
                        <FieldValueInput col={selectedCol} value={value} onChange={setValue} />
                    </div>
                )}

                {error && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{error}</p>
                )}

            </div>
        </Modal>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function FileMetadataPanel({ item }: { item: StorageItem | null }) {
    const { api, currentDriveId } = useStorageExplorer();

    // Columns for the current container — loaded once per container change
    const [columns, setColumns] = useState<ColumnDefinition[]>([]);
    const [colsLoading, setColsLoading] = useState(false);
    const [colsError, setColsError] = useState<string | null>(null);

    // Field values for the current item
    const [fields, setFields] = useState<DriveItemFields>({});
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [fieldsError, setFieldsError] = useState<string | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [editingColName, setEditingColName] = useState<string | null>(null);
    const [removingColName, setRemovingColName] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const driveId = currentDriveId;

    // Load container columns whenever the container changes
    useEffect(() => {
        if (!driveId) { setColumns([]); return; }
        setColsLoading(true);
        setColsError(null);
        api.columns.listContainerColumns(driveId)
            .then(setColumns)
            .catch((err: any) => setColsError(err?.message ?? 'Failed to load columns.'))
            .finally(() => setColsLoading(false));
    }, [driveId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load item fields whenever the selected item changes
    useEffect(() => {
        setFields({});
        setShowAdd(false);
        setEditingColName(null);
        setActionError(null);
        if (!item || !driveId || item.kind === 'container') return;
        setFieldsLoading(true);
        setFieldsError(null);
        api.columns.getItemFields(driveId, item.id)
            .then(raw => {
                // Keep only keys that correspond to known custom columns (by name)
                const colNames = new Set(columns.map(c => c.name).filter(Boolean));
                const filtered: DriveItemFields = {};
                for (const [k, v] of Object.entries(raw)) {
                    if (colNames.has(k) && v != null && v !== '') {
                        filtered[k] = String(v);
                    }
                }
                setFields(filtered);
            })
            .catch((err: any) => setFieldsError(err?.message ?? 'Failed to load fields.'))
            .finally(() => setFieldsLoading(false));
    }, [item?.id, driveId, columns]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const colByName = (name: string) => columns.find(c => c.name === name);
    const setFieldNames = Object.keys(fields);
    // Only offer "Set field" for columns that can be deleted (i.e. user-managed)
    const unsetColumns = columns.filter(c => c.name != null && c.isDeletable !== false && !setFieldNames.includes(c.name));

    async function handleSetField(columnId: string, value: string): Promise<void> {
        const col = columns.find(c => c.id === columnId);
        if (!col?.name || !driveId) return;
        setActionError(null);
        await api.columns.updateItemFields(driveId, item!.id, { [col.name]: value || null });
        setFields(prev => {
            if (!value) {
                const next = { ...prev };
                delete next[col.name!];
                return next;
            }
            return { ...prev, [col.name!]: value };
        });
        setShowAdd(false);
        setEditingColName(null);
    }

    async function removeField(colName: string) {
        if (!driveId) return;
        setRemovingColName(colName);
        setActionError(null);
        try {
            await api.columns.updateItemFields(driveId, item!.id, { [colName]: null });
            setFields(prev => {
                const next = { ...prev };
                delete next[colName];
                return next;
            });
        } catch (err: any) {
            setActionError(err?.message ?? 'Failed to remove field.');
        } finally {
            setRemovingColName(null);
        }
    }

    const isLoading = colsLoading || fieldsLoading;
    const fieldEntries = Object.entries(fields);
    // Split into editable (user-managed columns) and read-only (built-in columns)
    const editableEntries = fieldEntries.filter(([colName]) => colByName(colName)?.isDeletable !== false);
    const readonlyEntries = fieldEntries.filter(([colName]) => colByName(colName)?.isDeletable === false);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 10px' }}>
                <button
                    className="action-btn"
                    disabled={isLoading || unsetColumns.length === 0}
                    title={unsetColumns.length === 0 ? 'All columns already have values' : 'Set a field value from a column'}
                    onClick={() => { setShowAdd(true); setActionError(null); }}
                >
                    <span className="codicon codicon-add" />
                    Set field
                </button>
            </div>

            {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6, fontSize: 12 }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                    Loading…
                </div>
            )}
            {(colsError || fieldsError || actionError) && (
                <p style={{ margin: 0, color: 'var(--vscode-errorForeground)', fontSize: 12 }}>
                    {colsError ?? fieldsError ?? actionError}
                </p>
            )}

            {/* Empty state */}
            {!isLoading && !fieldsError && fieldEntries.length === 0 && (
                <p style={{ margin: 0, opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>
                    {columns.length === 0
                        ? 'No custom columns defined on this container.'
                        : 'No fields set. Use "Set field" to add values from the container\'s columns.'}
                </p>
            )}

            {/* Editable field rows (user-managed columns) */}
            {editableEntries.map(([colName, value]) => {
                const col = colByName(colName);
                const isRemoving = removingColName === colName;
                return (
                    <div
                        key={colName}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 0',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            opacity: isRemoving ? 0.4 : 1,
                            transition: 'opacity 0.15s',
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
                            disabled={isRemoving}
                            onClick={() => { setEditingColName(colName); setActionError(null); }}
                        >
                            <span className="codicon codicon-edit" />
                        </button>
                        <button
                            className="icon-btn"
                            title={isRemoving ? 'Removing…' : 'Remove'}
                            style={{ fontSize: 13, flexShrink: 0 }}
                            disabled={isRemoving}
                            onClick={() => removeField(colName)}
                        >
                            <span className={`codicon ${isRemoving ? 'codicon-loading codicon-modifier-spin' : 'codicon-close'}`} />
                        </button>
                    </div>
                );
            })}

            {/* Read-only field rows (built-in / non-deletable columns) */}
            {readonlyEntries.length > 0 && (
                <>
                    <div style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', opacity: 0.35, padding: '10px 0 2px',
                    }}>
                        Built-in
                    </div>
                    {readonlyEntries.map(([colName, value]) => {
                        const col = colByName(colName);
                        return (
                            <div
                                key={colName}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 0',
                                    borderBottom: '1px solid var(--vscode-panel-border)',
                                    opacity: 0.5,
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>
                                            {col?.displayName ?? colName}
                                        </span>
                                        {col && <TypeChip col={col} />}
                                    </div>
                                    <div style={{ fontSize: 12, wordBreak: 'break-all' }}>
                                        {col ? formatFieldValue(col, value) : value}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            {/* Add dialog */}
            {showAdd && unsetColumns.length > 0 && (
                <FieldDialog
                    columns={unsetColumns}
                    initialColumnId={unsetColumns[0].id ?? ''}
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
                        columns={columns}
                        initialColumnId={col.id ?? ''}
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
