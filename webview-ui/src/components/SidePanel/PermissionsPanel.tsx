import React, { useState, useRef, useEffect } from 'react';
import {
    DUMMY_CONTAINER_PERMISSIONS, DUMMY_USERS_AND_GROUPS,
} from '../../data/dummyData';
import type { PeopleSuggestion, ContainerRole } from '../../models/spe';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';

const ROLES: ContainerRole[] = ['owner', 'manager', 'writer', 'reader'];

const ROLE_LABELS: Record<ContainerRole, string> = {
    owner: 'Owners',
    manager: 'Managers',
    writer: 'Writers',
    reader: 'Readers',
};

interface EditState {
    originalRole: ContainerRole;
    originalId: string;
    dialog: AddDialogState;
}

const ROLE_COLORS: Record<ContainerRole, string> = {
    owner: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    manager: 'var(--vscode-symbolIcon-constructorForeground, #b8d7a3)',
    writer: 'var(--vscode-symbolIcon-variableForeground, #9CDCFE)',
    reader: 'var(--vscode-foreground)',
};

type Permissions = Record<ContainerRole, PeopleSuggestion[]>;

interface AddDialogState {
    searchText: string;
    selectedMember: PeopleSuggestion | null;
    role: ContainerRole;
    dropdownOpen: boolean;
}

const DEFAULT_DIALOG: AddDialogState = {
    searchText: '', selectedMember: null, role: 'reader', dropdownOpen: false,
};

export function PermissionsPanel({ item }: { item: StorageItem | null }) {
    const [permissions, setPermissions] = useState<Permissions>(() =>
        Object.fromEntries(ROLES.map(r => [r, [...DUMMY_CONTAINER_PERMISSIONS[r]]])) as Permissions
    );
    const [showAdd, setShowAdd] = useState(false);
    const [dialog, setDialog] = useState<AddDialogState>(DEFAULT_DIALOG);
    const [editState, setEditState] = useState<EditState | null>(null);

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its permissions.</p>;
    }
    if (item.kind !== 'container') {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Permissions management is only available for containers.</p>;
    }

    function removeMember(role: ContainerRole, id: string) {
        setPermissions(prev => ({ ...prev, [role]: prev[role].filter(m => m.id !== id) }));
    }

    function confirmAdd() {
        if (!dialog.selectedMember) return;
        const member = dialog.selectedMember;
        setPermissions(prev => ({ ...prev, [dialog.role]: [...prev[dialog.role], member] }));
        setShowAdd(false);
    }

    function openEdit(role: ContainerRole, member: PeopleSuggestion) {
        setEditState({
            originalRole: role,
            originalId: member.id,
            dialog: { searchText: member.displayName, selectedMember: member, role, dropdownOpen: false },
        });
    }

    function confirmEdit() {
        if (!editState?.dialog.selectedMember) return;
        const { originalRole, originalId } = editState;
        const { selectedMember: member, role: newRole } = editState.dialog;
        setPermissions(prev => {
            const next = { ...prev };
            next[originalRole] = prev[originalRole].filter(m => m.id !== originalId);
            if (!next[newRole].find(m => m.id === member.id)) {
                next[newRole] = [...next[newRole], member];
            }
            return next;
        });
        setEditState(null);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
                <button className="action-btn" onClick={() => { setDialog(DEFAULT_DIALOG); setShowAdd(true); }}>
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {ROLES.map(role => {
                const members = permissions[role];
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
                                <div key={m.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '5px 0',
                                    borderBottom: '1px solid var(--vscode-panel-border)',
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
                                    >
                                        <span className="codicon codicon-edit" />
                                    </button>
                                    <button
                                        className="icon-btn" title="Remove" style={{ fontSize: 13 }}
                                        onClick={() => removeMember(role, m.id)}
                                    >
                                        <span className="codicon codicon-close" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                );
            })}

            {showAdd && (
                <Modal
                    title="Add permission"
                    confirmLabel="Add"
                    confirmDisabled={!dialog.selectedMember}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowAdd(false)}
                >
                    <AddPermissionForm dialog={dialog} setDialog={setDialog} />
                </Modal>
            )}

            {editState && (
                <Modal
                    title="Edit permission"
                    confirmLabel="Save"
                    confirmDisabled={!editState.dialog.selectedMember}
                    onConfirm={confirmEdit}
                    onCancel={() => setEditState(null)}
                >
                    <AddPermissionForm
                        dialog={editState.dialog}
                        setDialog={d => setEditState(s => s ? { ...s, dialog: typeof d === 'function' ? d(s.dialog) : d } : s)}
                    />
                </Modal>
            )}
        </div>
    );
}

function AddPermissionForm({
    dialog,
    setDialog,
}: {
    dialog: AddDialogState;
    setDialog: React.Dispatch<React.SetStateAction<AddDialogState>>;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);

    const filtered = DUMMY_USERS_AND_GROUPS.filter(m => {
        const q = dialog.searchText.toLowerCase();
        return q.length > 0 && (
            m.displayName.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q) ||
            (m.userPrincipalName?.toLowerCase().includes(q) ?? false)
        );
    });

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
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
                <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>
                    User or group <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                </label>
                <div ref={wrapRef} style={{ position: 'relative' }}>
                    <input
                        autoFocus
                        style={inputStyle}
                        placeholder="Search by name or email…"
                        value={dialog.selectedMember ? dialog.selectedMember.displayName : dialog.searchText}
                        onChange={e => setDialog(d => ({
                            ...d, searchText: e.target.value, selectedMember: null, dropdownOpen: true,
                        }))}
                        onFocus={() => setDialog(d => ({ ...d, dropdownOpen: true }))}
                    />
                    {dialog.dropdownOpen && filtered.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            backgroundColor: 'var(--vscode-dropdown-background, var(--vscode-editor-background))',
                            border: '1px solid var(--vscode-panel-border)',
                            borderRadius: 3, zIndex: 100,
                            maxHeight: 160, overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        }}>
                            {filtered.map(m => (
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
