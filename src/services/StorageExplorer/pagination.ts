/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CollectionScope, ContinuationToken } from './protocol';

/** Number of items requested per server page. Graph may return fewer. */
export const DEFAULT_PAGE_SIZE = 200;

/**
 * One server page: the mapped items plus the raw Graph `@odata.nextLink`, if any.
 *
 * `nextLink` is **host-only**. It stays on this envelope, never on the items, and
 * `StorageExplorerApi` exchanges it for an opaque continuation identifier before anything
 * crosses the webview boundary. Carrying it separately means a caller that projects
 * `items` outward cannot leak a Graph URL by accident.
 *
 * `nextLink` is always present as a property — `undefined` on the final page — so "no next
 * page" is stated explicitly rather than being indistinguishable from "not reported".
 */
export interface GraphPage<T> {
    items: T[];
    nextLink?: string;
}

/** Shape of any Graph collection response this module reads. */
export interface RawCollectionResponse<TRaw> {
    value?: TRaw[];
    // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
    '@odata.nextLink'?: string;
}

/**
 * Project a raw Graph collection response into a single host-side page.
 *
 * The server's next-page link is never followed here: it is returned on the envelope so the
 * host can decide — explicitly — whether the user ever asks for another page, while the
 * mapped items stay free of any Graph URL.
 */
export function mapCollectionPage<TRaw, TOut>(
    response: RawCollectionResponse<TRaw> | null | undefined,
    map: (raw: TRaw) => TOut
): GraphPage<TOut> {
    const link = response?.['@odata.nextLink'];
    return {
        items: (response?.value ?? []).map(map),
        nextLink: typeof link === 'string' && link.length > 0 ? link : undefined,
    };
}

/** A continuation the host has issued and is willing to honour exactly once. */
interface ContinuationRecord {
    scope: CollectionScope;
    nextLink: string;
    /**
     * Which listing generation of `scope` minted this token. A refresh or a re-navigation
     * bumps the generation, which retires every token from the previous one.
     */
    generation: number;
}

/** Stable key for a collection scope, so generations and tokens line up per view. */
function scopeKey(scope: CollectionScope): string {
    return `${scope.kind}\u0000${scope.containerId ?? ''}\u0000${scope.itemId ?? ''}`;
}

/** True when two scopes name the same view. */
export function sameScope(a: CollectionScope, b: CollectionScope): boolean {
    return scopeKey(a) === scopeKey(b);
}

/** Thrown when a continuation cannot be honoured. Never carries the underlying Graph link. */
export class ContinuationRejectedError extends Error {
    public readonly code = 'invalidContinuation';
    public constructor(message: string) {
        super(message);
        this.name = 'ContinuationRejectedError';
    }
}

/**
 * Holds the Graph `@odata.nextLink` values for one panel and hands the webview opaque
 * identifiers instead.
 *
 * Three properties matter, and all three are enforced here rather than trusted from the
 * webview:
 *
 * - **Opacity** — the identifier is random and carries no encoded URL, so it cannot leak a
 *   Graph endpoint or be forged into one.
 * - **Binding** — every identifier remembers the collection kind, container, and folder it
 *   was minted for. A `loadMore` that names a different view is rejected outright.
 * - **Freshness** — starting a new listing for a view retires that view's earlier tokens, so
 *   a token captured before a refresh or a navigation cannot append stale rows.
 *
 * The store is per-`StorageExplorerApi`, i.e. per panel, so a token from another panel is
 * simply unknown here.
 */
export class ContinuationStore {
    private readonly _records = new Map<ContinuationToken, ContinuationRecord>();
    private readonly _generations = new Map<string, number>();
    /**
     * Scopes with a page fetch currently outstanding.
     *
     * A second "Load more" for the same view must wait: without this, two clicks that race
     * could either append the same page twice or, if one fails and reinstates while the other
     * succeeds, leave a replayable token for a page that is already on screen.
     */
    private readonly _inFlight = new Set<string>();
    private _counter = 0;

    public constructor(private readonly _randomId: () => string = defaultRandomId) { }

    /**
     * Retire every outstanding continuation for `scope` and return the new generation.
     *
     * Called at the start of each first-page listing: refreshing a folder, navigating back
     * into it, or re-opening the root list all invalidate whatever "next page" the previous
     * listing had offered.
     */
    public beginListing(scope: CollectionScope): number {
        const key = scopeKey(scope);
        const generation = (this._generations.get(key) ?? 0) + 1;
        this._generations.set(key, generation);
        // Whatever page was in flight belongs to the listing being replaced.
        this._inFlight.delete(key);
        for (const [token, record] of this._records) {
            if (scopeKey(record.scope) === key) {
                this._records.delete(token);
            }
        }
        return generation;
    }

    /**
     * Mint an opaque token for `nextLink`, or return undefined when there is no next page.
     *
     * A generation older than the current one for the scope yields no token: the listing that
     * produced it has already been superseded, so offering a "Load more" for it would append
     * rows the user can no longer be looking at.
     */
    public issue(
        scope: CollectionScope,
        nextLink: string | undefined,
        generation: number
    ): ContinuationToken | undefined {
        if (!nextLink) { return undefined; }
        if (this._generations.get(scopeKey(scope)) !== generation) { return undefined; }
        const token = `c${++this._counter}-${this._randomId()}`;
        this._records.set(token, { scope, nextLink, generation });
        return token;
    }

    /**
     * Redeem a token for its Graph link, consuming it so one click fetches exactly one page.
     *
     * @throws {ContinuationRejectedError} when the token is unknown, already used, retired by
     * a newer listing of the same view, superseded by another page fetch already running for
     * that view, or was issued for a different view than the one the webview claims to be in.
     */
    public redeem(token: unknown, claimedScope: CollectionScope): { scope: CollectionScope; nextLink: string; generation: number } {
        if (typeof token !== 'string' || token.length === 0) {
            throw new ContinuationRejectedError('The continuation token is missing or malformed.');
        }
        const record = this._records.get(token);
        if (!record) {
            throw new ContinuationRejectedError('This list has moved on; reload it to keep browsing.');
        }
        // Consume first: a rejected redemption must not leave a replayable token behind.
        this._records.delete(token);

        if (!sameScope(record.scope, claimedScope)) {
            throw new ContinuationRejectedError('The continuation token belongs to a different view.');
        }
        const key = scopeKey(record.scope);
        if (this._generations.get(key) !== record.generation) {
            throw new ContinuationRejectedError('This list has been refreshed; reload it to keep browsing.');
        }
        if (this._inFlight.has(key)) {
            throw new ContinuationRejectedError('Another page of this list is already loading.');
        }
        this._inFlight.add(key);
        return { scope: record.scope, nextLink: record.nextLink, generation: record.generation };
    }

    /**
     * Release the in-flight hold after a page fetch finished successfully.
     *
     * The token itself stays consumed; only the "one fetch at a time per view" hold is lifted,
     * so the continuation minted from the page just appended can be redeemed next.
     */
    public settle(scope: CollectionScope): void {
        this._inFlight.delete(scopeKey(scope));
    }

    /**
     * Put a redeemed token back after the page fetch itself failed.
     *
     * Redemption is single-use so one click fetches one page, but a transient Graph failure
     * must not silently consume a page: without this, a retry would skip straight past it.
     * A token whose listing has since been superseded is not reinstated.
     */
    public reinstate(
        token: ContinuationToken,
        record: { scope: CollectionScope; nextLink: string; generation: number }
    ): void {
        // The fetch is over either way, so the view is free for another attempt.
        this._inFlight.delete(scopeKey(record.scope));
        if (this._generations.get(scopeKey(record.scope)) !== record.generation) { return; }
        this._records.set(token, record);
    }

    /** Test seam: how many continuations are currently redeemable. */
    public get size(): number {
        return this._records.size;
    }
}

/**
 * Non-guessable suffix for a token, from the Web Crypto API.
 *
 * `globalThis.crypto` is present on the extension host (Node) and in the browser harness this
 * module family must keep running in, so one path covers both. When it is genuinely missing
 * this throws instead of falling back to a predictable value: an unpredictable identifier is
 * what keeps continuations unforgeable, so degrading silently would weaken the boundary.
 * Callers that need another source can pass one to the `ContinuationStore` constructor.
 */
function defaultRandomId(): string {
    const webCrypto: { getRandomValues?: (array: Uint8Array) => Uint8Array } | undefined =
        (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
    if (!webCrypto?.getRandomValues) {
        throw new Error(
            'Cannot create a Storage Explorer continuation: no cryptographic random source is ' +
            'available in this runtime. Run on a host that provides the Web Crypto API, or ' +
            'supply a random id generator to ContinuationStore.'
        );
    }
    const buffer = new Uint8Array(16);
    webCrypto.getRandomValues(buffer);
    return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}
