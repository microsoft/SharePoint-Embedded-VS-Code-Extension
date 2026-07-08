/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * In-memory Microsoft Graph state for the mock. Deliberately loosely typed — it only needs to
 * return shapes the webview services consume. State is seedable and mutated by the route handlers.
 */

export interface MockContainer {
    id: string;
    displayName: string;
    description: string | null;
    containerTypeId: string;
    createdDateTime: string;
    deletedDateTime?: string;
    status: string;
    lockState: string;
    assignedSensitivityLabel: unknown;
    drive: { id: string; quota: { used: number } };
}

export interface MockDriveItem {
    id: string;
    parentId: string | null;
    name: string;
    isFolder: boolean;
    size: number;
    createdDateTime: string;
    lastModifiedDateTime: string;
    webUrl: string;
    deleted?: boolean;
}

export interface MockPermission {
    id: string;
    roles: string[];
    grantedToV2?: { user?: { displayName?: string; id?: string; userPrincipalName?: string } };
    link?: { webUrl: string; type: string; scope: string };
}

export interface MockColumn {
    id: string;
    name: string;
    displayName: string;
    text?: Record<string, unknown>;
    boolean?: Record<string, unknown>;
    number?: Record<string, unknown>;
}

export interface MockVersion {
    id: string;
    lastModifiedDateTime: string;
    size: number;
    lastModifiedBy?: { user?: { displayName?: string } };
}

export interface MockPerson {
    id: string;
    displayName: string;
    mail?: string;
    userPrincipalName?: string;
    kind: 'user' | 'group';
}

let _seq = 0;
export function nextId(prefix: string): string {
    _seq += 1;
    return `${prefix}-${_seq.toString(36)}-${Date.now().toString(36)}`;
}

export class GraphState {
    containerTypeId = 'ct-mock-00000000-0000-0000-0000-000000000000';

    containers: MockContainer[] = [];
    deletedContainers: MockContainer[] = [];

    /** driveId (== containerId) → flat list of items (each with parentId). */
    driveItems = new Map<string, MockDriveItem[]>();
    /** containerId → items in its recycle bin. */
    recycleBins = new Map<string, MockDriveItem[]>();

    /** containerId → custom properties. */
    customProperties = new Map<string, Record<string, { value: string; isSearchable?: boolean }>>();
    /** containerId → settings. */
    settings = new Map<string, Record<string, unknown>>();
    /** containerId → container permissions. */
    containerPermissions = new Map<string, MockPermission[]>();
    /** containerId → columns. */
    columns = new Map<string, MockColumn[]>();

    /** itemId → item-level permissions. */
    itemPermissions = new Map<string, MockPermission[]>();
    /** itemId → listItem fields. */
    itemFields = new Map<string, Record<string, unknown>>();
    /** itemId → versions. */
    itemVersions = new Map<string, MockVersion[]>();

    users: MockPerson[] = [];
    groups: MockPerson[] = [];
    me = { id: 'me-1', displayName: 'Test User', mail: 'testuser@contoso.onmicrosoft.com', userPrincipalName: 'testuser@contoso.onmicrosoft.com' };

    // ── Factories ─────────────────────────────────────────────────────────────

    addContainer(displayName: string, description: string | null = null): MockContainer {
        const id = nextId('b!container');
        const c: MockContainer = {
            id,
            displayName,
            description,
            containerTypeId: this.containerTypeId,
            createdDateTime: new Date().toISOString(),
            status: 'active',
            lockState: 'unlocked',
            assignedSensitivityLabel: null,
            drive: { id, quota: { used: 0 } },
        };
        this.containers.push(c);
        this.driveItems.set(id, []);
        this.recycleBins.set(id, []);
        this.customProperties.set(id, {});
        this.settings.set(id, { itemMajorVersionLimit: 500, isOcrEnabled: false });
        this.containerPermissions.set(id, []);
        this.columns.set(id, []);
        return c;
    }

    addDriveItem(driveId: string, opts: { name: string; isFolder?: boolean; parentId?: string | null; size?: number }): MockDriveItem {
        const item: MockDriveItem = {
            id: nextId('item'),
            parentId: opts.parentId ?? null,
            name: opts.name,
            isFolder: opts.isFolder ?? false,
            size: opts.size ?? (opts.isFolder ? 0 : 1024),
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString(),
            webUrl: `https://contoso.sharepoint.com/contentstorage/${driveId}/${encodeURIComponent(opts.name)}`,
        };
        const list = this.driveItems.get(driveId) ?? [];
        list.push(item);
        this.driveItems.set(driveId, list);
        return item;
    }

    findContainer(id: string): MockContainer | undefined {
        return this.containers.find((c) => c.id === id);
    }
}

// ── Serializers (state → Graph response shapes) ────────────────────────────────

export function serializeContainer(c: MockContainer): Record<string, unknown> {
    return {
        id: c.id,
        displayName: c.displayName,
        description: c.description,
        containerTypeId: c.containerTypeId,
        createdDateTime: c.createdDateTime,
        status: c.status,
        lockState: c.lockState,
        assignedSensitivityLabel: c.assignedSensitivityLabel,
        drive: c.drive,
        ...(c.deletedDateTime ? { deletedDateTime: c.deletedDateTime } : {}),
    };
}

export function serializeDriveItem(i: MockDriveItem): Record<string, unknown> {
    return {
        id: i.id,
        name: i.name,
        size: i.size,
        createdDateTime: i.createdDateTime,
        lastModifiedDateTime: i.lastModifiedDateTime,
        webUrl: i.webUrl,
        '@microsoft.graph.downloadUrl': i.isFolder ? undefined : `https://contoso.sharepoint.com/download/${i.id}`,
        ...(i.isFolder ? { folder: { childCount: 0 } } : { file: { mimeType: 'application/octet-stream' } }),
    };
}

/** Create a state pre-seeded with one container + a few items, or N containers for perf. */
export function seedState(opts?: { containers?: number; itemsPerContainer?: number }): GraphState {
    const state = new GraphState();
    const nContainers = opts?.containers ?? 1;

    for (let i = 0; i < nContainers; i++) {
        const c = state.addContainer(nContainers === 1 ? 'Seed Container' : `Container ${String(i + 1).padStart(4, '0')}`);
        const nItems = opts?.itemsPerContainer ?? (nContainers === 1 ? 3 : 0);
        for (let j = 0; j < nItems; j++) {
            const isFolder = j % 3 === 0;
            state.addDriveItem(c.id, { name: isFolder ? `Folder ${j + 1}` : `File ${j + 1}.docx`, isFolder });
        }
        // Seed one container permission + column + custom property on the first container.
        if (i === 0) {
            state.containerPermissions.set(c.id, [
                { id: nextId('perm'), roles: ['owner'], grantedToV2: { user: { displayName: 'Test User', id: 'me-1', userPrincipalName: 'testuser@contoso.onmicrosoft.com' } } },
            ]);
            state.columns.set(c.id, [
                { id: nextId('col'), name: 'Project', displayName: 'Project', text: {} },
            ]);
            state.customProperties.set(c.id, { Department: { value: 'Engineering', isSearchable: true } });
        }
    }

    state.users = [
        { id: 'u-1', displayName: 'Ada Lovelace', mail: 'ada@contoso.onmicrosoft.com', userPrincipalName: 'ada@contoso.onmicrosoft.com', kind: 'user' },
        { id: 'u-2', displayName: 'Alan Turing', mail: 'alan@contoso.onmicrosoft.com', userPrincipalName: 'alan@contoso.onmicrosoft.com', kind: 'user' },
    ];
    state.groups = [
        { id: 'g-1', displayName: 'Engineering', mail: 'eng@contoso.onmicrosoft.com', kind: 'group' },
    ];
    return state;
}
