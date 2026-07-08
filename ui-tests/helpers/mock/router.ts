/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    GraphState,
    MockColumn,
    MockDriveItem,
    MockPermission,
    MockVersion,
    nextId,
    serializeContainer,
    serializeDriveItem,
} from './state';

export interface RouteResult {
    status: number;
    body: unknown;
}

interface Ctx {
    m: RegExpMatchArray;
    query: URLSearchParams;
    body: Record<string, unknown>;
    state: GraphState;
}

interface Route {
    method: string;
    re: RegExp;
    handler: (ctx: Ctx) => RouteResult;
}

const ok = (body: unknown): RouteResult => ({ status: 200, body });
const created = (body: unknown): RouteResult => ({ status: 201, body });
const noContent = (): RouteResult => ({ status: 204, body: '' });
const list = (values: unknown[]): RouteResult => ok({ value: values });

function personToGranted(p: { displayName: string; id: string; userPrincipalName?: string }) {
    return { user: { displayName: p.displayName, id: p.id, userPrincipalName: p.userPrincipalName } };
}

/**
 * Ordered route table. First match wins, so more specific paths precede generic ones.
 * All paths are matched AFTER stripping the `/v1.0` or `/beta` version prefix.
 */
const routes: Route[] = [
    // ── Container recycle bin (beta) ─────────────────────────────────────────
    {
        method: 'POST',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/recycleBin\/items\/restore$/,
        handler: ({ m, body, state }) => {
            const bin = state.recycleBins.get(m[1]) ?? [];
            const ids = (body.ids as string[]) ?? [];
            for (const id of ids) {
                const idx = bin.findIndex((i) => i.id === id);
                if (idx >= 0) {
                    const [item] = bin.splice(idx, 1);
                    item.deleted = false;
                    (state.driveItems.get(m[1]) ?? []).push(item);
                }
            }
            return ok({ value: ids });
        },
    },
    {
        method: 'POST',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/recycleBin\/items\/delete$/,
        handler: ({ m, body, state }) => {
            const bin = state.recycleBins.get(m[1]) ?? [];
            const ids = new Set((body.ids as string[]) ?? []);
            state.recycleBins.set(m[1], bin.filter((i) => !ids.has(i.id)));
            return ok({ value: [...ids] });
        },
    },
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/recycleBin\/items$/,
        handler: ({ m, state }) => list((state.recycleBins.get(m[1]) ?? []).map(serializeDriveItem)),
    },

    // ── Container permissions ────────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/permissions$/,
        handler: ({ m, state }) => list(state.containerPermissions.get(m[1]) ?? []),
    },
    {
        method: 'POST',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/permissions$/,
        handler: ({ m, body, state }) => {
            const perms = state.containerPermissions.get(m[1]) ?? [];
            const perm: MockPermission = {
                id: nextId('perm'),
                roles: (body.roles as string[]) ?? ['reader'],
                grantedToV2: (body.grantedToV2 as MockPermission['grantedToV2']) ?? undefined,
            };
            perms.push(perm);
            state.containerPermissions.set(m[1], perms);
            return created(perm);
        },
    },
    {
        method: 'PATCH',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/permissions\/([^/]+)$/,
        handler: ({ m, body, state }) => {
            const perm = (state.containerPermissions.get(m[1]) ?? []).find((p) => p.id === m[2]);
            if (perm && body.roles) { perm.roles = body.roles as string[]; }
            return ok(perm ?? {});
        },
    },
    {
        method: 'DELETE',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/permissions\/([^/]+)$/,
        handler: ({ m, state }) => {
            const perms = (state.containerPermissions.get(m[1]) ?? []).filter((p) => p.id !== m[2]);
            state.containerPermissions.set(m[1], perms);
            return noContent();
        },
    },

    // ── Container columns ────────────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/columns$/,
        handler: ({ m, state }) => list(state.columns.get(m[1]) ?? []),
    },
    {
        method: 'POST',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/columns$/,
        handler: ({ m, body, state }) => {
            const cols = state.columns.get(m[1]) ?? [];
            const col: MockColumn = {
                id: nextId('col'),
                name: (body.name as string) ?? 'Column',
                displayName: (body.displayName as string) ?? (body.name as string) ?? 'Column',
                text: body.text as Record<string, unknown> | undefined,
                boolean: body.boolean as Record<string, unknown> | undefined,
                number: body.number as Record<string, unknown> | undefined,
            };
            cols.push(col);
            state.columns.set(m[1], cols);
            return created(col);
        },
    },
    {
        method: 'PATCH',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/columns\/([^/]+)$/,
        handler: ({ m, body, state }) => {
            const col = (state.columns.get(m[1]) ?? []).find((c) => c.id === m[2]);
            if (col) { Object.assign(col, body); }
            return ok(col ?? {});
        },
    },
    {
        method: 'DELETE',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/columns\/([^/]+)$/,
        handler: ({ m, state }) => {
            state.columns.set(m[1], (state.columns.get(m[1]) ?? []).filter((c) => c.id !== m[2]));
            return noContent();
        },
    },

    // ── Container custom properties ──────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/customProperties$/,
        handler: ({ m, state }) => ok(state.customProperties.get(m[1]) ?? {}),
    },
    {
        method: 'PATCH',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)\/customProperties$/,
        handler: ({ m, body, state }) => {
            const props = state.customProperties.get(m[1]) ?? {};
            for (const [k, v] of Object.entries(body)) {
                if (v === null) { delete props[k]; }
                else { props[k] = v as { value: string; isSearchable?: boolean }; }
            }
            state.customProperties.set(m[1], props);
            return ok({});
        },
    },

    // ── Deleted containers ───────────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/deletedContainers$/,
        handler: ({ state }) => list(state.deletedContainers.map((c) => ({ ...serializeContainer(c), deletedDateTime: c.deletedDateTime }))),
    },
    {
        method: 'POST',
        re: /^\/storage\/fileStorage\/deletedContainers\/([^/]+)\/restore$/,
        handler: ({ m, state }) => {
            const idx = state.deletedContainers.findIndex((c) => c.id === m[1]);
            if (idx >= 0) {
                const [c] = state.deletedContainers.splice(idx, 1);
                delete c.deletedDateTime;
                state.containers.push(c);
                return ok(serializeContainer(c));
            }
            return ok({});
        },
    },
    {
        method: 'DELETE',
        re: /^\/storage\/fileStorage\/deletedContainers\/([^/]+)$/,
        handler: ({ m, state }) => {
            state.deletedContainers = state.deletedContainers.filter((c) => c.id !== m[1]);
            return noContent();
        },
    },

    // ── Containers ───────────────────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/containers$/,
        handler: ({ state }) => list(state.containers.map(serializeContainer)),
    },
    {
        method: 'POST',
        re: /^\/storage\/fileStorage\/containers$/,
        handler: ({ body, state }) => {
            const c = state.addContainer((body.displayName as string) ?? 'container', (body.description as string) ?? null);
            return created(serializeContainer(c));
        },
    },
    {
        method: 'GET',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)$/,
        handler: ({ m, query, state }) => {
            const select = query.get('$select') ?? '';
            if (select === 'settings') {
                return ok({ settings: state.settings.get(m[1]) ?? {} });
            }
            const c = state.findContainer(m[1]);
            return ok(c ? serializeContainer(c) : {});
        },
    },
    {
        method: 'PATCH',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)$/,
        handler: ({ m, body, state }) => {
            const c = state.findContainer(m[1]);
            if (c) {
                if (typeof body.displayName === 'string') { c.displayName = body.displayName; }
                if (typeof body.description === 'string') { c.description = body.description; }
                if (body.settings) { state.settings.set(m[1], { ...(state.settings.get(m[1]) ?? {}), ...(body.settings as Record<string, unknown>) }); }
            }
            return ok(c ? serializeContainer(c) : {});
        },
    },
    {
        method: 'DELETE',
        re: /^\/storage\/fileStorage\/containers\/([^/]+)$/,
        handler: ({ m, state }) => {
            const idx = state.containers.findIndex((c) => c.id === m[1]);
            if (idx >= 0) {
                const [c] = state.containers.splice(idx, 1);
                c.deletedDateTime = new Date().toISOString();
                state.deletedContainers.push(c);
            }
            return noContent();
        },
    },

    // ── Drive item permissions ───────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/permissions$/,
        handler: ({ m, state }) => list(state.itemPermissions.get(m[2]) ?? []),
    },
    {
        method: 'POST',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/createLink$/,
        handler: ({ m, body, state }) => {
            const perms = state.itemPermissions.get(m[2]) ?? [];
            const perm: MockPermission = {
                id: nextId('perm'),
                roles: [(body.type as string) === 'edit' ? 'write' : 'read'],
                link: { webUrl: `https://contoso.sharepoint.com/:x:/g/${nextId('link')}`, type: (body.type as string) ?? 'view', scope: (body.scope as string) ?? 'anonymous' },
            };
            perms.push(perm);
            state.itemPermissions.set(m[2], perms);
            return created(perm);
        },
    },
    {
        method: 'POST',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/invite$/,
        handler: ({ m, body, state }) => {
            const perms = state.itemPermissions.get(m[2]) ?? [];
            const roles = (body.roles as string[]) ?? ['read'];
            const perm: MockPermission = { id: nextId('perm'), roles, grantedToV2: { user: { displayName: 'Invited User', id: nextId('u') } } };
            perms.push(perm);
            state.itemPermissions.set(m[2], perms);
            return ok({ value: [perm] });
        },
    },
    {
        method: 'PATCH',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/permissions\/([^/]+)$/,
        handler: ({ m, body, state }) => {
            const perm = (state.itemPermissions.get(m[2]) ?? []).find((p) => p.id === m[3]);
            if (perm && body.roles) { perm.roles = body.roles as string[]; }
            return ok(perm ?? {});
        },
    },
    {
        method: 'DELETE',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/permissions\/([^/]+)$/,
        handler: ({ m, state }) => {
            state.itemPermissions.set(m[2], (state.itemPermissions.get(m[2]) ?? []).filter((p) => p.id !== m[3]));
            return noContent();
        },
    },

    // ── Drive item versions ──────────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/versions$/,
        handler: ({ m, state }) => list(state.itemVersions.get(m[2]) ?? []),
    },
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/versions\/([^/]+)$/,
        handler: ({ m }) => ok({ '@microsoft.graph.downloadUrl': `https://contoso.sharepoint.com/download/${m[2]}/versions/${m[3]}` }),
    },
    {
        method: 'POST',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/versions\/([^/]+)\/restoreVersion$/,
        handler: () => ok({}),
    },
    {
        method: 'DELETE',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/versions\/([^/]+)$/,
        handler: ({ m, state }) => {
            state.itemVersions.set(m[2], (state.itemVersions.get(m[2]) ?? []).filter((v: MockVersion) => v.id !== m[3]));
            return noContent();
        },
    },

    // ── Drive item listItem fields (case-insensitive listItem/listitem) ──────
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/listitem\/fields$/i,
        handler: ({ m, state }) => ok(state.itemFields.get(m[2]) ?? {}),
    },
    {
        method: 'PATCH',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/listitem\/fields$/i,
        handler: ({ m, body, state }) => {
            state.itemFields.set(m[2], { ...(state.itemFields.get(m[2]) ?? {}), ...body });
            return ok(state.itemFields.get(m[2]));
        },
    },

    // ── Drive item preview / retentionLabel ──────────────────────────────────
    {
        method: 'POST',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/preview$/,
        handler: ({ m }) => ok({ getUrl: `https://contoso.sharepoint.com/preview/${m[2]}` }),
    },
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/retentionLabel$/,
        handler: () => ok({}),
    },

    // ── Drive children (list + create folder) ────────────────────────────────
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/root\/children$/,
        handler: ({ m, state }) => list((state.driveItems.get(m[1]) ?? []).filter((i) => i.parentId === null).map(serializeDriveItem)),
    },
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/children$/,
        handler: ({ m, state }) => list((state.driveItems.get(m[1]) ?? []).filter((i) => i.parentId === m[2]).map(serializeDriveItem)),
    },
    {
        method: 'POST',
        re: /^\/drives\/([^/]+)\/root\/children$/,
        handler: ({ m, body, state }) => created(serializeDriveItem(state.addDriveItem(m[1], { name: (body.name as string) ?? 'New folder', isFolder: !!body.folder, parentId: null }))),
    },
    {
        method: 'POST',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)\/children$/,
        handler: ({ m, body, state }) => created(serializeDriveItem(state.addDriveItem(m[1], { name: (body.name as string) ?? 'New folder', isFolder: !!body.folder, parentId: m[2] }))),
    },

    // ── Drive item content upload (PUT :/name:/content) ──────────────────────
    {
        method: 'PUT',
        re: /^\/drives\/([^/]+)\/root:\/(.+):\/content$/,
        handler: ({ m, state }) => created(serializeDriveItem(state.addDriveItem(m[1], { name: decodeURIComponent(m[2]), isFolder: false, parentId: null }))),
    },
    {
        method: 'PUT',
        re: /^\/drives\/([^/]+)\/items\/([^/:]+):\/(.+):\/content$/,
        handler: ({ m, state }) => created(serializeDriveItem(state.addDriveItem(m[1], { name: decodeURIComponent(m[3]), isFolder: false, parentId: m[2] }))),
    },

    // ── Drive item get / rename / delete ─────────────────────────────────────
    {
        method: 'GET',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)$/,
        handler: ({ m, state }) => {
            const item = (state.driveItems.get(m[1]) ?? []).find((i) => i.id === m[2]);
            return ok(item ? serializeDriveItem(item) : { id: m[2] });
        },
    },
    {
        method: 'PATCH',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)$/,
        handler: ({ m, body, state }) => {
            const item = (state.driveItems.get(m[1]) ?? []).find((i) => i.id === m[2]);
            if (item && typeof body.name === 'string') { item.name = body.name; }
            return ok(item ? serializeDriveItem(item) : {});
        },
    },
    {
        method: 'DELETE',
        re: /^\/drives\/([^/]+)\/items\/([^/]+)$/,
        handler: ({ m, state }) => {
            const items = state.driveItems.get(m[1]) ?? [];
            const idx = items.findIndex((i) => i.id === m[2]);
            if (idx >= 0) {
                const [item] = items.splice(idx, 1);
                item.deleted = true;
                (state.recycleBins.get(m[1]) ?? state.recycleBins.set(m[1], []).get(m[1])!).push(item);
            }
            return noContent();
        },
    },

    // ── People + me ──────────────────────────────────────────────────────────
    {
        method: 'GET',
        re: /^\/users$/,
        handler: ({ query, state }) => {
            const q = (query.get('$search') ?? query.get('$filter') ?? '').toLowerCase();
            const users = q ? state.users.filter((u) => u.displayName.toLowerCase().includes(q.replace(/["']/g, '')) || (u.mail ?? '').toLowerCase().includes(q)) : state.users;
            return list(users);
        },
    },
    {
        method: 'GET',
        re: /^\/groups$/,
        handler: ({ state }) => list(state.groups),
    },
    {
        method: 'GET',
        re: /^\/me$/,
        handler: ({ state }) => ok(state.me),
    },
];

/** Resolve a request against the route table. Returns null if no route matched. */
export function resolveRoute(
    method: string,
    pathname: string,
    query: URLSearchParams,
    body: Record<string, unknown>,
    state: GraphState,
): RouteResult | null {
    const path = pathname.replace(/^\/(v1\.0|beta)/, '');
    for (const route of routes) {
        if (route.method !== method) { continue; }
        const m = path.match(route.re);
        if (m) { return route.handler({ m, query, body, state }); }
    }
    return null;
}
