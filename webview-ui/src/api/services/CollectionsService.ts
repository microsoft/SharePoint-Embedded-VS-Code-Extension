import { request } from '../rpc';
import type { CollectionScope, PagedResult, StorageItem } from '../protocol';

/**
 * Explicit, one-page-at-a-time continuation of a Storage Explorer listing.
 *
 * The `continuation` handle is opaque: the extension host keeps the Graph
 * `@odata.nextLink` in its own memory and hands the webview a random identifier bound to the
 * panel, the collection kind, the container, and the folder it was issued for. Passing the
 * scope back lets the host reject a token that belongs to a view the user has left.
 *
 * Nothing here runs implicitly — this service is only reached from a user's "Load more".
 */
export class CollectionsService {
    /** Fetch exactly one more page for a listing this panel already started. */
    async loadMore(continuation: string, scope: CollectionScope): Promise<PagedResult<StorageItem>> {
        return request('collections.loadMore', { continuation, scope });
    }
}
