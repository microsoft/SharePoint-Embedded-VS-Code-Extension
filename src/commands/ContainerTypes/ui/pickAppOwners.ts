/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { User } from '../../../models/schemas';
import { GraphProvider } from '../../../services/Graph/GraphProvider';

interface UserQuickPickItem extends vscode.QuickPickItem {
    user: User;
}

const DEFAULT_MAX = 3;
const SEARCH_DEBOUNCE_MS = 250;
const BASE_TITLE = 'Select app owners';

/**
 * Multi-select user picker for assigning owners to the Entra app that backs
 * a container type. Members-only by default. Enforces a max cap (default 3)
 * to match the SharePoint admin center flow.
 *
 * Returns `undefined` if the user escapes (no selection made). Returns an
 * empty array if the user accepts with no selection — callers should decide
 * whether that's valid for their flow (optional for Trial, required for
 * Standard / D2C).
 */
export async function pickAppOwners(options?: {
    max?: number;
    initial?: User[];
    title?: string;
}): Promise<User[] | undefined> {
    const graphProvider = GraphProvider.getInstance();
    const max = options?.max ?? DEFAULT_MAX;
    const initial = options?.initial ?? [];

    const qp = vscode.window.createQuickPick<UserQuickPickItem>();
    qp.canSelectMany = true;
    qp.ignoreFocusOut = true;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.placeholder = vscode.l10n.t('Type to search your tenant by name, email, or UPN (members only)');

    const setTitle = (selectedCount: number, note?: string) => {
        const base = options?.title ?? vscode.l10n.t(BASE_TITLE);
        const suffix = vscode.l10n.t('{0} of {1} selected', selectedCount, max);
        qp.title = note ? `${base} — ${suffix} — ${note}` : `${base} — ${suffix}`;
    };
    setTitle(initial.length);

    const toItem = (u: User): UserQuickPickItem => ({
        user: u,
        label: u.displayName ?? u.userPrincipalName ?? u.id,
        description: u.userPrincipalName ?? u.mail ?? undefined,
        detail: u.jobTitle ?? undefined
    });

    // Track users across searches so accepted picks survive filter changes.
    const knownUsers = new Map<string, User>();
    for (const u of initial) {
        knownUsers.set(u.id, u);
    }
    const selectedIds = new Set<string>(initial.map(u => u.id));

    const renderItems = (users: User[]) => {
        for (const u of users) {
            knownUsers.set(u.id, u);
        }
        // Always include any currently-selected users that aren't in the
        // latest search result so the check marks don't vanish.
        const byId = new Map<string, User>(users.map(u => [u.id, u]));
        for (const id of selectedIds) {
            if (!byId.has(id)) {
                const known = knownUsers.get(id);
                if (known) {
                    byId.set(id, known);
                }
            }
        }

        const items = Array.from(byId.values()).map(toItem);
        qp.items = items;
        qp.selectedItems = items.filter(i => selectedIds.has(i.user.id));
    };

    // Seed with an initial member list so the picker isn't empty on open.
    qp.busy = true;
    qp.show();
    try {
        const seed = await graphProvider.users.list({ top: 25 });
        renderItems(seed);
    } catch (error: any) {
        qp.dispose();
        if (isInsufficientPrivilegesError(error)) {
            vscode.window.showInformationMessage(
                vscode.l10n.t('Skipping owner selection — the signed-in app needs Graph User.Read.All to list tenant users. Add the scope to the app manifest and grant admin consent to enable the owner picker.')
            );
        } else {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Skipping owner selection — failed to load tenant users: {0}', error?.message ?? String(error))
            );
        }
        return undefined;
    } finally {
        qp.busy = false;
    }

    let searchTimeout: NodeJS.Timeout | undefined;
    let searchGeneration = 0;

    qp.onDidChangeValue(value => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        const myGeneration = ++searchGeneration;
        const trimmed = value.trim();
        searchTimeout = setTimeout(async () => {
            qp.busy = true;
            try {
                const results = trimmed
                    ? await graphProvider.users.search(trimmed, { top: 25 })
                    : await graphProvider.users.list({ top: 25 });
                // Ignore stale responses
                if (myGeneration !== searchGeneration) {
                    return;
                }
                renderItems(results);
            } catch (error: any) {
                if (myGeneration === searchGeneration) {
                    setTitle(selectedIds.size, vscode.l10n.t('Search failed: {0}', error?.message ?? String(error)));
                }
            } finally {
                if (myGeneration === searchGeneration) {
                    qp.busy = false;
                }
            }
        }, SEARCH_DEBOUNCE_MS);
    });

    qp.onDidChangeSelection(selected => {
        if (selected.length > max) {
            // Keep only the first `max` — dropping the last pick that pushed
            // over the limit. Show a transient hint in the title.
            const capped = selected.slice(0, max);
            qp.selectedItems = capped;
            selectedIds.clear();
            for (const item of capped) {
                selectedIds.add(item.user.id);
            }
            setTitle(selectedIds.size, vscode.l10n.t('Maximum {0} owners — unselect one to add another', max));
            return;
        }
        selectedIds.clear();
        for (const item of selected) {
            selectedIds.add(item.user.id);
        }
        setTitle(selectedIds.size);
    });

    function isInsufficientPrivilegesError(err: any): boolean {
        const code = err?.code ?? err?.response?.data?.error?.code;
        const status = err?.statusCode ?? err?.response?.status;
        const message = (err?.message ?? '').toString().toLowerCase();
        return (
            code === 'Authorization_RequestDenied' ||
            code === 'Forbidden' ||
            status === 403 ||
            message.includes('insufficient privileges')
        );
    }

    return new Promise<User[] | undefined>(resolve => {
        let resolved = false;
        qp.onDidAccept(() => {
            if (resolved) { return; }
            resolved = true;
            const picked: User[] = [];
            for (const id of selectedIds) {
                const u = knownUsers.get(id);
                if (u) { picked.push(u); }
            }
            qp.hide();
            qp.dispose();
            resolve(picked);
        });
        qp.onDidHide(() => {
            if (resolved) { return; }
            resolved = true;
            qp.dispose();
            resolve(undefined);
        });
    });
}
