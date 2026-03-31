import React, { useState } from 'react';
import {
    DriveItemPermission, DriveRole, LinkType, LinkScope,
    DUMMY_DRIVE_PERMISSIONS,
} from '../../data/dummyData';
import { StorageItem } from '../../models/StorageItem';
import { Modal } from '../Modal/Modal';

// ── Permission type discriminator ────────────────────────────────────────────
type PermissionKind = 'direct' | 'link' | 'invitation';

function getKind(p: DriveItemPermission): PermissionKind {
    if (p.link) return 'link';
    if (p.invitation) return 'invitation';
    return 'direct';
}

// ── Display constants ─────────────────────────────────────────────────────────
const ROLE_COLOR: Record<DriveRole, string> = {
    owner: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    write: 'var(--vscode-symbolIcon-variableForeground, #9CDCFE)',
    read:  'var(--vscode-foreground)',
};
const ROLE_LABEL: Record<DriveRole, string> = { owner: 'Owner', write: 'Write', read: 'Read' };
const LINK_TYPE_LABEL: Record<LinkType, string> = { view: 'View', edit: 'Edit', embed: 'Embed' };
const SCOPE_LABEL: Record<LinkScope, string> = {
    anonymous:      'Anyone',
    organization:   'Organization',
    existingAccess: 'People with existing access',
};

// ── Shared style constants ────────────────────────────────────────────────────
const INPUT: React.CSSProperties = {
    width: '100%', padding: '5px 8px', fontSize: 12,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
    borderRadius: 3, outline: 'none',
    fontFamily: 'var(--vscode-font-family)',
};
const SELECT: React.CSSProperties = {
    ...INPUT,
    background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
    color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
    border: '1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))',
};
const LBL: React.CSSProperties = { fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 };
const CHECK: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' };
const FORM: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };

// ── Small reusable components ─────────────────────────────────────────────────
function RoleBadge({ roles }: { roles: DriveRole[] }) {
    const role = roles[0];
    if (!role) return null;
    return (
        <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 8,
            color: ROLE_COLOR[role], border: `1px solid ${ROLE_COLOR[role]}50`,
            whiteSpace: 'nowrap', flexShrink: 0,
        }}>
            {ROLE_LABEL[role] ?? role}
        </span>
    );
}

function ExpiryBadge({ iso }: { iso?: string }) {
    if (!iso) return null;
    const d = new Date(iso);
    const expired = d < new Date();
    return (
        <span title={d.toLocaleString()} style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 8,
            color: expired ? 'var(--vscode-errorForeground)' : 'var(--vscode-terminal-ansiYellow, #cca700)',
            border: '1px solid currentColor', opacity: 0.8,
            whiteSpace: 'nowrap', flexShrink: 0,
        }}>
            {expired ? 'Expired' : `Exp ${d.toLocaleDateString()}`}
        </span>
    );
}

function RoleSelector({ value, onChange, options }: {
    value: DriveRole; onChange: (v: DriveRole) => void; options: DriveRole[];
}) {
    return (
        <div>
            <label style={LBL}>Access level</label>
            <select value={value} style={SELECT} onChange={e => onChange(e.target.value as DriveRole)}>
                {options.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
        </div>
    );
}

function ExpirationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label style={LBL}>Expiration date (optional)</label>
            <input type="date" style={INPUT} value={value} onChange={e => onChange(e.target.value)} />
        </div>
    );
}

// ── Permission row identity sub-views ─────────────────────────────────────────
function DirectIdentity({ perm }: { perm: DriveItemPermission }) {
    const identity = perm.grantedToV2?.user ?? perm.grantedToV2?.group;
    const isGroup = !!perm.grantedToV2?.group;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
                className={`codicon ${isGroup ? 'codicon-organization' : 'codicon-account'}`}
                style={{ fontSize: 14, opacity: 0.65, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {identity?.displayName ?? '—'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {identity?.userPrincipalName}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <RoleBadge roles={perm.roles} />
                <ExpiryBadge iso={perm.expirationDateTime} />
            </div>
        </div>
    );
}

function InvitationIdentity({ perm }: { perm: DriveItemPermission }) {
    const inv = perm.invitation!;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span className="codicon codicon-mail" style={{ fontSize: 14, opacity: 0.65, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.email}
                </div>
                {inv.invitedBy?.user && (
                    <div style={{ fontSize: 11, opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Invited by {inv.invitedBy.user.displayName}
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <RoleBadge roles={perm.roles} />
                <ExpiryBadge iso={perm.expirationDateTime} />
            </div>
        </div>
    );
}

function LinkIdentity({ perm }: { perm: DriveItemPermission }) {
    const link = perm.link!;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span className="codicon codicon-link" style={{ fontSize: 14, opacity: 0.65, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{LINK_TYPE_LABEL[link.type]} link</span>
                    <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 8,
                        border: '1px solid var(--vscode-panel-border)', opacity: 0.7, whiteSpace: 'nowrap',
                    }}>
                        {SCOPE_LABEL[link.scope]}
                    </span>
                    {link.preventsDownload && (
                        <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 8,
                            border: '1px solid var(--vscode-panel-border)', opacity: 0.7, whiteSpace: 'nowrap',
                        }}>
                            No download
                        </span>
                    )}
                    <ExpiryBadge iso={perm.expirationDateTime} />
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.webUrl}
                </div>
            </div>
        </div>
    );
}

// ── PermissionRow ─────────────────────────────────────────────────────────────
function PermissionRow({ perm, onEdit, onDelete, onCopyLink }: {
    perm: DriveItemPermission;
    onEdit: () => void;
    onDelete: () => void;
    onCopyLink: () => void;
}) {
    const kind = getKind(perm);
    const inherited = !!perm.inheritedFrom;
    return (
        <div style={{
            padding: '7px 0',
            borderBottom: '1px solid var(--vscode-panel-border)',
            opacity: inherited ? 0.65 : 1,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                {kind === 'direct'     && <DirectIdentity perm={perm} />}
                {kind === 'invitation' && <InvitationIdentity perm={perm} />}
                {kind === 'link'       && <LinkIdentity perm={perm} />}

                <div style={{ display: 'flex', flexShrink: 0 }}>
                    {kind === 'link' && (
                        <button
                            className="icon-btn"
                            title={inherited ? 'Cannot copy inherited link' : 'Copy link'}
                            style={{ fontSize: 13 }}
                            disabled={inherited}
                            onClick={onCopyLink}
                        >
                            <span className="codicon codicon-copy" />
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        title={inherited ? 'Inherited — cannot edit' : 'Edit'}
                        style={{ fontSize: 13 }}
                        disabled={inherited}
                        onClick={onEdit}
                    >
                        <span className="codicon codicon-edit" />
                    </button>
                    <button
                        className="icon-btn"
                        title={inherited ? 'Inherited — cannot delete' : 'Delete'}
                        style={{ fontSize: 13 }}
                        disabled={inherited}
                        onClick={onDelete}
                    >
                        <span className="codicon codicon-trash" />
                    </button>
                </div>
            </div>

            {inherited && (
                <div style={{ marginTop: 3, fontSize: 10, opacity: 0.45, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="codicon codicon-arrow-up" style={{ fontSize: 9 }} />
                    Inherited from {perm.inheritedFrom!.path}
                </div>
            )}
        </div>
    );
}

// ── Create Permission Dialog ──────────────────────────────────────────────────
type CreateMode = 'direct' | 'link';

interface DirectForm {
    emails: string;
    role: DriveRole;
    requireSignIn: boolean;
    sendInvitation: boolean;
    expirationDate: string;
}
interface LinkForm {
    type: LinkType;
    scope: LinkScope;
    preventDownload: boolean;
    expirationDate: string;
}

const DEFAULT_DIRECT: DirectForm = {
    emails: '', role: 'read', requireSignIn: true, sendInvitation: true, expirationDate: '',
};
const DEFAULT_LINK: LinkForm = {
    type: 'view', scope: 'organization', preventDownload: false, expirationDate: '',
};

function CreatePermissionDialog({ onCreate, onCancel }: {
    onCreate: (perms: DriveItemPermission[]) => void;
    onCancel: () => void;
}) {
    const [mode, setMode] = useState<CreateMode>('direct');
    const [direct, setDirect] = useState<DirectForm>(DEFAULT_DIRECT);
    const [linkForm, setLinkForm] = useState<LinkForm>(DEFAULT_LINK);
    const [createdUrl, setCreatedUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const canConfirm = mode === 'direct' ? direct.emails.trim().length > 0 : true;

    function handleConfirm() {
        if (mode === 'direct') {
            const emails = direct.emails.split(',').map(e => e.trim()).filter(Boolean);
            const perms: DriveItemPermission[] = emails.map((email, i) => ({
                id: `new-${Date.now()}-${i}`,
                roles: [direct.role],
                expirationDateTime: direct.expirationDate ? new Date(direct.expirationDate).toISOString() : undefined,
                invitation: { email, signInRequired: direct.requireSignIn },
            }));
            onCreate(perms);
            onCancel();
        } else {
            const id = `link-${Date.now()}`;
            const prefix = linkForm.type === 'edit' ? ':w:' : ':b:';
            const webUrl = `https://contoso.sharepoint.com/${prefix}/s/${id}`;
            const perm: DriveItemPermission = {
                id,
                roles: [linkForm.type === 'edit' ? 'write' : 'read'],
                expirationDateTime: linkForm.expirationDate ? new Date(linkForm.expirationDate).toISOString() : undefined,
                link: {
                    type: linkForm.type,
                    scope: linkForm.scope,
                    webUrl,
                    preventsDownload: linkForm.preventDownload,
                },
            };
            onCreate([perm]);
            setCreatedUrl(webUrl);
        }
    }

    function copyCreatedUrl() {
        if (!createdUrl) return;
        navigator.clipboard.writeText(createdUrl).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // Post-creation: show the new link
    if (createdUrl) {
        return (
            <Modal title="Link created" confirmLabel="Done" cancelLabel="" onConfirm={onCancel} onCancel={onCancel}>
                <div style={FORM}>
                    <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
                        Your sharing link is ready. Copy it to share with others.
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input readOnly style={{ ...INPUT, flex: 1 }} value={createdUrl} />
                        <button className="action-btn" onClick={copyCreatedUrl} style={{ flexShrink: 0 }}>
                            <span className={`codicon ${copied ? 'codicon-check' : 'codicon-copy'}`} />
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            title="Add permission"
            confirmLabel={mode === 'direct' ? 'Invite' : 'Create link'}
            confirmDisabled={!canConfirm}
            onConfirm={handleConfirm}
            onCancel={onCancel}
        >
            <div style={FORM}>
                {/* Mode tab strip */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    {(['direct', 'link'] as CreateMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '5px 12px 6px', fontSize: 12,
                                color: 'var(--vscode-foreground)',
                                fontFamily: 'var(--vscode-font-family)',
                                borderBottom: `2px solid ${mode === m ? 'var(--vscode-focusBorder)' : 'transparent'}`,
                                opacity: mode === m ? 1 : 0.6,
                                marginBottom: -1,
                            }}
                        >
                            {m === 'direct' ? 'Invite people' : 'Create link'}
                        </button>
                    ))}
                </div>

                {mode === 'direct' ? (
                    <>
                        <div>
                            <label style={LBL}>
                                Email(s) <span style={{ color: 'var(--vscode-errorForeground)' }}>*</span>
                            </label>
                            <input
                                autoFocus
                                style={INPUT}
                                placeholder="user@example.com, user2@example.com"
                                value={direct.emails}
                                onChange={e => setDirect(d => ({ ...d, emails: e.target.value }))}
                            />
                            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3 }}>
                                Separate multiple addresses with commas
                            </div>
                        </div>
                        <RoleSelector
                            value={direct.role}
                            onChange={role => setDirect(d => ({ ...d, role }))}
                            options={['read', 'write']}
                        />
                        <ExpirationPicker
                            value={direct.expirationDate}
                            onChange={v => setDirect(d => ({ ...d, expirationDate: v }))}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={CHECK}>
                                <input
                                    type="checkbox"
                                    checked={direct.requireSignIn}
                                    onChange={e => setDirect(d => ({ ...d, requireSignIn: e.target.checked }))}
                                />
                                Require sign-in
                            </label>
                            <label style={CHECK}>
                                <input
                                    type="checkbox"
                                    checked={direct.sendInvitation}
                                    onChange={e => setDirect(d => ({ ...d, sendInvitation: e.target.checked }))}
                                />
                                Send invitation email
                            </label>
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label style={LBL}>Link type</label>
                            <select
                                value={linkForm.type}
                                style={SELECT}
                                onChange={e => setLinkForm(l => ({ ...l, type: e.target.value as LinkType }))}
                            >
                                <option value="view">View — recipients can view only</option>
                                <option value="edit">Edit — recipients can edit</option>
                                <option value="embed">Embed — for embedding in web pages</option>
                            </select>
                        </div>
                        <div>
                            <label style={LBL}>Who can use this link</label>
                            <select
                                value={linkForm.scope}
                                style={SELECT}
                                onChange={e => setLinkForm(l => ({ ...l, scope: e.target.value as LinkScope }))}
                            >
                                <option value="anonymous">Anyone (no sign-in required)</option>
                                <option value="organization">People in your organization</option>
                            </select>
                        </div>
                        <ExpirationPicker
                            value={linkForm.expirationDate}
                            onChange={v => setLinkForm(l => ({ ...l, expirationDate: v }))}
                        />
                        <label style={CHECK}>
                            <input
                                type="checkbox"
                                checked={linkForm.preventDownload}
                                onChange={e => setLinkForm(l => ({ ...l, preventDownload: e.target.checked }))}
                            />
                            Prevent download
                        </label>
                    </>
                )}
            </div>
        </Modal>
    );
}

// ── Edit Permission Dialog ────────────────────────────────────────────────────
function describePermission(perm: DriveItemPermission): string {
    const kind = getKind(perm);
    if (kind === 'link') {
        return `${LINK_TYPE_LABEL[perm.link!.type]} link · ${SCOPE_LABEL[perm.link!.scope]}`;
    }
    if (kind === 'invitation') return `Invitation · ${perm.invitation!.email}`;
    const identity = perm.grantedToV2?.user ?? perm.grantedToV2?.group;
    return identity?.displayName ?? 'Permission';
}

interface EditForm {
    role: DriveRole;
    expirationDate: string;
    preventDownload: boolean;
}

function EditPermissionDialog({ perm, onSave, onCancel }: {
    perm: DriveItemPermission;
    onSave: (patch: Partial<DriveItemPermission>) => void;
    onCancel: () => void;
}) {
    const kind = getKind(perm);
    const [form, setForm] = useState<EditForm>({
        role: perm.roles[0] ?? 'read',
        expirationDate: perm.expirationDateTime
            ? perm.expirationDateTime.substring(0, 10)
            : '',
        preventDownload: perm.link?.preventsDownload ?? false,
    });

    function handleSave() {
        const patch: Partial<DriveItemPermission> = {
            roles: [form.role],
            expirationDateTime: form.expirationDate
                ? new Date(form.expirationDate).toISOString()
                : undefined,
        };
        if (kind === 'link' && perm.link) {
            patch.link = { ...perm.link, preventsDownload: form.preventDownload };
        }
        onSave(patch);
    }

    const roleOptions: DriveRole[] = kind === 'direct' ? ['read', 'write', 'owner'] : ['read', 'write'];

    return (
        <Modal title="Edit permission" confirmLabel="Save" onConfirm={handleSave} onCancel={onCancel}>
            <div style={FORM}>
                {/* Read-only identity header */}
                <div style={{
                    fontSize: 12, fontStyle: 'italic', opacity: 0.6,
                    padding: '4px 8px', borderRadius: 3,
                    backgroundColor: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07))',
                }}>
                    {describePermission(perm)}
                </div>

                <RoleSelector
                    value={form.role}
                    onChange={role => setForm(f => ({ ...f, role }))}
                    options={roleOptions}
                />
                <ExpirationPicker
                    value={form.expirationDate}
                    onChange={v => setForm(f => ({ ...f, expirationDate: v }))}
                />
                {kind === 'link' && (
                    <label style={CHECK}>
                        <input
                            type="checkbox"
                            checked={form.preventDownload}
                            onChange={e => setForm(f => ({ ...f, preventDownload: e.target.checked }))}
                        />
                        Prevent download
                    </label>
                )}
            </div>
        </Modal>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function FilePermissionsPanel({ item }: { item: StorageItem | null }) {
    const [permissions, setPermissions] = useState<DriveItemPermission[]>([...DUMMY_DRIVE_PERMISSIONS]);
    const [showCreate, setShowCreate] = useState(false);
    const [editingPerm, setEditingPerm] = useState<DriveItemPermission | null>(null);

    if (!item) {
        return <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>Select an item to view its permissions.</p>;
    }

    function handleCreate(perms: DriveItemPermission[]) {
        setPermissions(prev => [...prev, ...perms]);
    }

    function handleDelete(id: string) {
        setPermissions(prev => prev.filter(p => p.id !== id));
    }

    function handleEdit(patch: Partial<DriveItemPermission>) {
        setPermissions(prev =>
            prev.map(p => p.id === editingPerm?.id ? { ...p, ...patch } : p)
        );
        setEditingPerm(null);
    }

    function copyLink(perm: DriveItemPermission) {
        if (perm.link?.webUrl) {
            navigator.clipboard.writeText(perm.link.webUrl).catch(() => {});
        }
    }

    const direct    = permissions.filter(p => !p.inheritedFrom);
    const inherited = permissions.filter(p => !!p.inheritedFrom);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
                <button className="action-btn" onClick={() => setShowCreate(true)}>
                    <span className="codicon codicon-add" />
                    Add
                </button>
            </div>

            {/* Direct permissions */}
            {direct.length === 0 ? (
                <p style={{ margin: '0 0 8px', opacity: 0.4, fontSize: 12, fontStyle: 'italic' }}>
                    No direct permissions.
                </p>
            ) : (
                direct.map(p => (
                    <PermissionRow
                        key={p.id}
                        perm={p}
                        onEdit={() => setEditingPerm(p)}
                        onDelete={() => handleDelete(p.id)}
                        onCopyLink={() => copyLink(p)}
                    />
                ))
            )}

            {/* Inherited permissions */}
            {inherited.length > 0 && (
                <>
                    <div style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', opacity: 0.45, padding: '10px 0 2px',
                    }}>
                        Inherited
                    </div>
                    {inherited.map(p => (
                        <PermissionRow
                            key={p.id}
                            perm={p}
                            onEdit={() => {}}
                            onDelete={() => {}}
                            onCopyLink={() => copyLink(p)}
                        />
                    ))}
                </>
            )}

            {showCreate && (
                <CreatePermissionDialog
                    onCreate={handleCreate}
                    onCancel={() => setShowCreate(false)}
                />
            )}
            {editingPerm && (
                <EditPermissionDialog
                    perm={editingPerm}
                    onSave={handleEdit}
                    onCancel={() => setEditingPerm(null)}
                />
            )}
        </div>
    );
}
