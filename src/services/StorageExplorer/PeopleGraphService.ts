/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import { PeopleSuggestion } from './protocol';

/** People-picker lookups for the Storage Explorer, executed on the extension host. */
export class PeopleGraphService {
    public constructor(private readonly _client: Graph.Client) { }

    /**
     * Search for users matching a query string.
     * Uses `$search` with `ConsistencyLevel: eventual` for prefix matching on
     * displayName and userPrincipalName. Returns up to 8 results.
     */
    public async searchUsers(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) { return []; }
        const q = query.replace(/"/g, '');
        const result = await this._client
            .api('/users')
            .search(`"displayName:${q}" OR "userPrincipalName:${q}"`)
            .select(['id', 'displayName', 'userPrincipalName', 'mail'])
            .top(8)
            .header('ConsistencyLevel', 'eventual')
            .get();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (result.value ?? []).map((u: any): PeopleSuggestion => ({
            id: u.id,
            displayName: u.displayName ?? u.userPrincipalName ?? '',
            email: u.mail ?? u.userPrincipalName ?? '',
            userPrincipalName: u.userPrincipalName ?? undefined,
            kind: 'user',
        }));
    }

    /**
     * Search for groups matching a query string.
     * Requires Group.Read.All (or GroupMember.Read.All) scope.
     * Returns up to 8 results.
     */
    public async searchGroups(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) { return []; }
        const q = query.replace(/"/g, '');
        const result = await this._client
            .api('/groups')
            .search(`"displayName:${q}"`)
            .select(['id', 'displayName', 'mail'])
            .top(8)
            .header('ConsistencyLevel', 'eventual')
            .get();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (result.value ?? []).map((g: any): PeopleSuggestion => ({
            id: g.id,
            displayName: g.displayName ?? '',
            email: g.mail ?? '',
            kind: 'group',
        }));
    }

    /**
     * Search for both users and groups matching a query string.
     * Results are interleaved: users first, then groups, each capped at 5
     * so the combined list stays manageable.
     * Group search requires `Group.Read.All` or `GroupMember.Read.All`.
     * If the group search fails (e.g. insufficient permissions) it is
     * silently ignored and only user results are returned.
     */
    public async search(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) { return []; }
        const tolerant = (p: Promise<PeopleSuggestion[]>): Promise<PeopleSuggestion[]> =>
            p.then(value => value, () => [] as PeopleSuggestion[]);

        const [users, groups] = await Promise.all([
            tolerant(this.searchUsers(query)),
            tolerant(this.searchGroups(query)),
        ]);
        return [...users.slice(0, 5), ...groups.slice(0, 5)];
    }
}
