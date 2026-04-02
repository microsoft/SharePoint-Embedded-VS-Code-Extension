import { Client } from '@microsoft/microsoft-graph-client';
import { WebviewAuthProvider } from '../WebviewAuthProvider';
import { withAuthRetry } from '../GraphClient';
import type { PeopleSuggestion } from '../../models/spe';

export class PeopleGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
    ) {}

    /**
     * Search for users matching a query string.
     * Uses `$search` with `ConsistencyLevel: eventual` for prefix matching on
     * displayName and userPrincipalName. Returns up to 8 results.
     */
    async searchUsers(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) return [];
        return withAuthRetry(this._authProvider, async () => {
            const q = query.replace(/"/g, '');
            const result = await this._client
                .api('/users')
                .search(`"displayName:${q}" OR "userPrincipalName:${q}"`)
                .select(['id', 'displayName', 'userPrincipalName', 'mail'])
                .top(8)
                .header('ConsistencyLevel', 'eventual')
                .get();

            return (result.value ?? []).map((u: any): PeopleSuggestion => ({
                id: u.id,
                displayName: u.displayName ?? u.userPrincipalName ?? '',
                email: u.mail ?? u.userPrincipalName ?? '',
                userPrincipalName: u.userPrincipalName ?? undefined,
                kind: 'user',
            }));
        });
    }

    /**
     * Search for groups matching a query string.
     * Requires Group.Read.All (or GroupMember.Read.All) scope.
     * Returns up to 8 results.
     */
    async searchGroups(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) return [];
        return withAuthRetry(this._authProvider, async () => {
            const q = query.replace(/"/g, '');
            const result = await this._client
                .api('/groups')
                .search(`"displayName:${q}"`)
                .select(['id', 'displayName', 'mail'])
                .top(8)
                .header('ConsistencyLevel', 'eventual')
                .get();

            return (result.value ?? []).map((g: any): PeopleSuggestion => ({
                id: g.id,
                displayName: g.displayName ?? '',
                email: g.mail ?? '',
                kind: 'group',
            }));
        });
    }

    /**
     * Search for both users and groups matching a query string.
     * Results are interleaved: users first, then groups, each capped at 5
     * so the combined list stays manageable.
     * Group search requires `Group.Read.All` or `GroupMember.Read.All`.
     * If the group search fails (e.g. insufficient permissions) it is
     * silently ignored and only user results are returned.
     */
    async search(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) return [];
        const [users, groups] = await Promise.allSettled([
            this.searchUsers(query),
            this.searchGroups(query),
        ]);
        const userResults  = users.status  === 'fulfilled' ? users.value.slice(0, 5)  : [];
        const groupResults = groups.status === 'fulfilled' ? groups.value.slice(0, 5) : [];
        return [...userResults, ...groupResults];
    }

    /**
     * Resolve a user by email address or object ID.
     */
    async resolve(_emailOrId: string): Promise<PeopleSuggestion | null> {
        throw new Error('PeopleGraphService.resolve: not yet implemented');
    }
}
