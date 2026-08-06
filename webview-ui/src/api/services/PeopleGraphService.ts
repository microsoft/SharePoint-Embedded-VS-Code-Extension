import { request } from '../rpc';
import type { PeopleSuggestion } from '../protocol';

/** People-picker lookups, executed by the extension host. */
export class PeopleGraphService {
    /** Search for users matching a query string. Returns up to 8 results. */
    async searchUsers(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) return [];
        return request('people.searchUsers', { query });
    }

    /**
     * Search for groups matching a query string.
     * Requires Group.Read.All (or GroupMember.Read.All) scope. Returns up to 8 results.
     */
    async searchGroups(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) return [];
        return request('people.searchGroups', { query });
    }

    /**
     * Search for both users and groups matching a query string.
     * Users first, then groups, each capped at 5. A failing group search
     * (e.g. insufficient permissions) is ignored by the host.
     */
    async search(query: string): Promise<PeopleSuggestion[]> {
        if (!query.trim()) return [];
        return request('people.search', { query });
    }

    /** Resolve a user by email address or object ID. */
    async resolve(_emailOrId: string): Promise<PeopleSuggestion | null> {
        throw new Error('PeopleGraphService.resolve: not yet implemented');
    }
}
