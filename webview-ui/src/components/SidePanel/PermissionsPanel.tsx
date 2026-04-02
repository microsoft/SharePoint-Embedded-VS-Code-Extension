import React, { useState, useRef, useEffect } from 'react';
import type { Permission } from '@microsoft/microsoft-graph-types';
import type { PeopleSuggestion, ContainerRole, SpeIdentity } from '../../models/spe';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

const ROLES: ContainerRole[] = ['owner', 'manager', 'writer', 'reader'];

const ROLE_LABELS: Record<ContainerRole, string> = {
    owner: 'Owners',
    manager: 'Managers',
    writer: 'Writers',
    reader: 'Readers',
};

const ROLE_COLORS: Record<ContainerRole, string> = {
    owner: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    manager: 'var(--vscode-symbolIcon-constructorForeground, #b8d7a3)',
    writer: 'var(--vscode-symbolIcon-variableForeground, #9CDCFE)',
    reader: 'var(--vscode-foreground)',
};

// ── Data model ────────────────────────────────────────────────────────────────

interface PermEntry extends PeopleSuggestion {
    /** The Graph Permission.id — needed for update/delete calls. */
    permissionId: string;
}

type PermMap = Record<ContainerRole, PermEntry[]>;

function emptyPermMap(): PermMap {
    return { owner: [], manager: [], writer: [], reader: [] };
}

function toPermEntry(perm: Permission): PermEntry {
    const user = perm.grantedToV2?.user as SpeIdentity | undefined;
    const group = (perm.grantedToV2 as any)?.group as
        | { id?: string; displayName?: string; mail?: string }
        | undefined;

    if (user) {
        return {
            permissionId: perm.id!,
            id: user.id ?? perm.id!,
            displayName: user.displayName ?? user.userPrincipalName ?? 'Unknown user',
            email: (user as any).mail ?? user.userPrincipalName ?? '',
            userPrincipalName: user.userPrincipalName ?? undefined,
            kind: 'user',
        };
    }
    if (group) {
        return {
            permissionId: perm.id!,
            id: group.id ?? perm.id!,
            displayName: group.displayName ?? 'Unknown group',
            email: group.mail ?? '',
            kind: 'group',
        };
    }
    return {
        permissionId: perm.id!,
        id: perm.id!,
        displayName: 'Unknown',
        email: '',
        kind: 'user',
    };
}

function buildPermMap(perms: Permission[]): PermMap {
    const map = emptyPermMap();
    for (const perm of perms) {
        const role = (perm.roles?.[0] ?? 'reader') as ContainerRole;
        if (role in map) {
            map[role].push(toPermEntry(perm));
        }
    }
    return map;
}

// ── Dialog state ──────────────────────────────────────────────────────────────

interface AddDialogState {
    searchText: string;
    selectedMember: PeopleSuggestion | null;
    role: ContainerRole;
    dropdownOpen: boolean;
}

const DEFAULT_DIALOG: AddDialogState = {
    searchText: '', selectedMember: null, role: 'reader', dropdownOpen: false,
};

interface EditState {
    permissionId: string;
    originalRole: ContainerRole;
    dialog: AddDialogState;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PermissionsPanel({ item }: { item: StorageItem | null }) {
    const { api } = useStorageExplorer();

    const [permMap, setPermMap] = useState<PermMap>(emptyPermMap);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [addDialog, setAddDialog] = useState<AddDialogState>(DEFAULT_DIALOG);
    const [addBusy, setAddBusy] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const [editState, setEditState] = useState<EditState | null>(null);
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [removeError, setRemoveError] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    // People-picker search state (shared between add/edit forms)
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<PeopleSuggestion[]>([]);

    // Load permissions when container changes
    useEffect(() => {
        if (!item || item.kind !== 'container') return;
        setLoading(true);
        setLoadError(null);
        api.permissions.listContainerPermissions(item.id)
            .then(perms => setPermMap(buildPermMap(perms)))
            .catch((err: any) => setLoadError(err?.message ?? 'Failed to load permissions.'))
            .finally(() => setLoading(false));
    }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced people search
    useEffect(() => {
        if (!searchQuery.trim()) { setSuggestions([]); return; }
        const timer = setTimeout(() => {
            api.people.search(searchQuery)
                .then(setSuggestions)
                .catch(() => setSuggestions([]));
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its permissions.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Permissions management is only available for containers.</p>;
    }

    async function reloadPermissions() {
        const perms = await api.permissions.listContainerPermissions(item!.id);
        setPermMap(buildPermMap(perms));
    }

    async function removeMember(permissionId: string) {
        setRemovingId(permissionId);
        setRemoveError(null);
        try {
            await api.permissions.deleteContainerPermission(item!.id, permissionId);
            await reloadPermissions();
        } catch (err: any) {
            setRemoveError(err?.message ?? 'Failed to remove permission.');
        } finally {
            setRemovingId(null);
        }
    }

    async function confirmAdd() {
        if (!addDialog.selectedMember) return;
        setAddBusy(true);
        setAddError(null);
        try {
            await api.permissions.addContainerPermission(item!.id, addDialog.selectedMember, addDialog.role);
            await reloadPermissions();
            setShowAdd(false);
        } catch (err: any) {
            setAddError(err?.message ?? 'Failed to add permission.');
        } finally {
            setAddBusy(false);
        }
    }

    function openEdit(role: ContainerRole, member: PermEntry) {
        setEditError(null);
        setSearchQuery('');
        setSuggestions([]);
        setEditState({
            permissionId: member.permissionId,
            originalRole: role,
            dialog: {
                searchText: member.displayName,
                selectedMember: member,
                role,
                dropdownOpen: false,
            },
        });
    }

    async function confirmEdit() {
        if (!editState) return;
        setEditBusy(true);
        setEditError(null);
        try {
            await api.permissions.updateContainerPermission(
                item!.id,
                editState.permissionId,
                editState.dialog.role,
            );
            await reloadPermissions();
            setEditState(null);
        } catch (err: any) {
            setEditError(err?.message ?? 'Failed to update permission.');
        } finally {
            setEditBusy(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 8px' }}>
                {removeError && (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)', flex: 1 }}>{removeError}</p>
                )}
                <div style={{ flex: 1 }} />
                <button
                    className="action-btn"
                    onClick={() => {
                        setAddDialog(DEFAULT_DIALOG);
                        setAddError(null);
                        setSearchQuery('');
                        setSuggestions([]);
                        setShowAdd(true);
                    }}
                    disabled={loading}
                >
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {/* Loading / error states */}
            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', opacity: 0.6, fontSize: 12 }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 13 }} />
                    Loading permissions…
                </div>
            )}
            {loadError && (
                <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--vscode-errorForeground)' }}>{loadError}</p>
            )}

            {/* Permission list by role */}
            {!loading && !loadError && ROLES.map(role => {
                const members = permMap[role];
                return (
                    <div key={role} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 3px' }}>
                            <span style={{
                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.05em', color: ROLE_COLORS[role],
                            }}>
                                {ROLE_LABELS[role]}
                            </span>
                            <span style={{
                                fontSize: 10, padding: '0 5px', borderRadius: 8,
                                backgroundColor: 'var(--vscode-badge-background)',
                                color: 'var(--vscode-badge-foreground)',
                            }}>
                                {members.length}
                            </span>
                        </div>

                        {members.length === 0 ? (
                            <div style={{ fontSize: 12, opacity: 0.35, padding: '3px 0 6px', fontStyle: 'italic' }}>
                                No members
                            </div>
                        ) : (
                            members.map(m => (
                                <div key={m.permissionId} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '5px 0',
                                    borderBottom: '1px solid var(--vscode-panel-border)',
                                    opacity: removingId === m.permissionId ? 0.4 : 1,
                                }}>
                                    <span
                                        className={`codicon ${m.kind === 'group' ? 'codicon-organization' : 'codicon-account'}`}
                                        style={{ fontSize: 14, opacity: 0.65, flexShrink: 0 }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.displayName}
                                        </div>
                                        <div style={{ fontSize: 11, opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.userPrincipalName ?? m.email}
                                        </div>
                                    </div>
                                    <button
                                        className="icon-btn" title="Edit" style={{ fontSize: 13 }}
                                        onClick={() => openEdit(role, m)}
                                        disabled={removingId === m.permissionId}
                                    >
                                        <span className="codicon codicon-edit" />
                                    </button>
                                    <button
                                        className="icon-btn" title="Remove" style={{ fontSize: 13 }}
                                        onClick={() => removeMember(m.permissionId)}
                                        disabled={removingId === m.permissionId}
                                    >
                                        {removingId === m.permissionId
                                            ? <span className="codicon codicon-loading codicon-modifier-spin" />
                                            : <span className="codicon codicon-close" />
                                        }
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                );
            })}

            {/* Add permission modal */}
            {showAdd && (
                <Modal
                    title="Add permission"
                    confirmLabel={addBusy ? 'Adding…' : 'Add'}
                    confirmDisabled={!addDialog.selectedMember || addBusy}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowAdd(false)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {addError && (
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{addError}</p>
                        )}
                        <AddPermissionForm
                            dialog={addDialog}
                            setDialog={setAddDialog}
                            suggestions={suggestions}
                            onSearchChange={q => { setSearchQuery(q); setSuggestions([]); }}
                        />
                    </div>
                </Modal>
            )}

            {/* Edit permission modal */}
            {editState && (
                <Modal
                    title="Edit permission"
                    confirmLabel={editBusy ? 'Saving…' : 'Save'}
                    confirmDisabled={editBusy}
                    onConfirm={confirmEdit}
                    onCancel={() => setEditState(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {editError && (
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--vscode-errorForeground)' }}>{editError}</p>
                        )}
                        <AddPermissionForm
                            dialog={editState.dialog}
                            setDialog={d => setEditState(s => s
                                ? { ...s, dialog: typeof d === 'function' ? d(s.dialog) : d }
                                : s
                            )}
                            suggestions={[]}
                            onSearchChange={() => {}}
                            isEdit
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ── Add / Edit form ───────────────────────────────────────────────────────────

function AddPermissionForm({
    dialog,
    setDialog,
    suggestions,
    onSearchChange,
    isEdit = false,
}: {
    dialog: AddDialogState;
    setDialog: React.Dispatch<React.SetStateAction<AddDialogState>>;
    suggestions: PeopleSuggestion[];
    onSearchChange: (query: string) => void;
    isEdit?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setDialog(d => ({ ...d, dropdownOpen: false }));
            }
        }
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [setDialog]);

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '5px 8px', fontSize: 12,
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
        borderRadius: 3, outline: 'none',
        fontFamily: 'var(--vscode-font-family)',
        boxSizing: 'border-box',
    };

    const displayValue = dialog.selectedMember
        ? dialog.selectedMember.displayName
        : dialog.searchText;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
                <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>
                    User or group <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                </label>
                <div ref={wrapRef} style={{ position: 'relative' }}>
                    <input
                        autoFocus={!isEdit}
                        readOnly={isEdit}
                        style={{ ...inputStyle, opacity: isEdit ? 0.7 : 1 }}
                        placeholder="Search by name or email…"
                        value={displayValue}
                        onChange={e => {
                            if (isEdit) return;
                            const val = e.target.value;
                            setDialog(d => ({ ...d, searchText: val, selectedMember: null, dropdownOpen: true }));
                            onSearchChange(val);
                        }}
                        onFocus={() => { if (!isEdit) setDialog(d => ({ ...d, dropdownOpen: true })); }}
                    />
                    {!isEdit && dialog.dropdownOpen && suggestions.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            backgroundColor: 'var(--vscode-dropdown-background, var(--vscode-editor-background))',
                            border: '1px solid var(--vscode-panel-border)',
                            borderRadius: 3, zIndex: 100,
                            maxHeight: 160, overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        }}>
                            {suggestions.map(m => (
                                <button
                                    key={m.id}
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        setDialog(d => ({
                                            ...d, selectedMember: m,
                                            searchText: m.displayName, dropdownOpen: false,
                                        }));
                                    }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        width: '100%', padding: '6px 10px',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--vscode-foreground)',
                                        fontFamily: 'var(--vscode-font-family)',
                                        fontSize: 12, textAlign: 'left',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <span
                                        className={`codicon ${m.kind === 'group' ? 'codicon-organization' : 'codicon-account'}`}
                                        style={{ opacity: 0.7, flexShrink: 0 }}
                                    />
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.displayName}
                                        </div>
                                        <div style={{ fontSize: 11, opacity: 0.6 }}>{m.userPrincipalName ?? m.email}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div>
                <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>Role</label>
                <select
                    autoFocus={isEdit}
                    value={dialog.role}
                    onChange={e => setDialog(d => ({ ...d, role: e.target.value as ContainerRole }))}
                    style={{
                        ...inputStyle,
                        background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
                        color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
                        border: '1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))',
                    }}
                >
                    {ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}


