/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The continuation store: opacity, scope binding and freshness (AC-03, AC-04, AC-02).
 *
 * The webview never sees a Graph `@odata.nextLink`. It receives an opaque identifier and hands
 * it back on "Load more". Everything that could turn that identifier into an unintended fetch —
 * forgery, replay, a token from another folder or panel, a token minted before a refresh — has
 * to be refused here, in the host, because the webview side of the boundary is untrusted.
 */

import { test, expect } from '@playwright/test';
import {
    ContinuationRejectedError,
    ContinuationStore,
    mapCollectionPage,
    sameScope,
} from '../../src/services/StorageExplorer/pagination';
import type { CollectionScope } from '../../src/services/StorageExplorer/protocol';

const LINK_1 = 'https://graph.microsoft.com/v1.0/drives/b!drive1/root/children?$skiptoken=PAGE2';
const LINK_2 = 'https://graph.microsoft.com/v1.0/drives/b!drive1/root/children?$skiptoken=PAGE3';

const ROOT: CollectionScope = { kind: 'containers' };
const DELETED: CollectionScope = { kind: 'deletedContainers' };
const DRIVE_ROOT: CollectionScope = { kind: 'driveChildren', containerId: 'b!c1' };
const FOLDER_A: CollectionScope = { kind: 'driveChildren', containerId: 'b!c1', itemId: 'folder-a' };
const FOLDER_B: CollectionScope = { kind: 'driveChildren', containerId: 'b!c1', itemId: 'folder-b' };
const OTHER_CONTAINER: CollectionScope = { kind: 'driveChildren', containerId: 'b!c2', itemId: 'folder-a' };
const RECYCLE: CollectionScope = { kind: 'recycleBin', containerId: 'b!c1' };

/** Issue a token for `scope` on a freshly begun listing. */
function issueFresh(store: ContinuationStore, scope: CollectionScope, link = LINK_1): string {
    const generation = store.beginListing(scope);
    const token = store.issue(scope, link, generation);
    expect(token, 'a page with a server link must yield a continuation').toBeTruthy();
    return token as string;
}

/** Run `action` and return the error it threw, failing the test if it did not throw. */
function expectRejection(action: () => unknown, because: string): ContinuationRejectedError {
    let thrown: unknown;
    try {
        action();
    } catch (error) {
        thrown = error;
    }
    expect(thrown, because).toBeInstanceOf(ContinuationRejectedError);
    const rejection = thrown as ContinuationRejectedError;
    expect(rejection.code, 'the webview needs a stable code to react to').toBe('invalidContinuation');
    // A rejection message is user-visible; leaking the endpoint here would defeat the whole point.
    expect(rejection.message).not.toContain('graph.microsoft.com');
    expect(rejection.message).not.toContain('skiptoken');
    return rejection;
}

test.describe('AC-03 — continuation identifiers are opaque', () => {
    test('a token encodes nothing about the Graph endpoint it stands for', () => {
        const store = new ContinuationStore();

        const token = issueFresh(store, DRIVE_ROOT);

        expect(token).not.toContain('http');
        expect(token).not.toContain('graph.microsoft.com');
        expect(token).not.toContain('skiptoken');
        expect(token).not.toContain('drive1');
        // Nor may it be a reversible encoding of the link.
        expect(Buffer.from(token, 'base64').toString('utf8')).not.toContain('graph.microsoft.com');
    });

    test('two tokens for the same link are different and independently redeemable exactly once', () => {
        const store = new ContinuationStore();
        const first = issueFresh(store, DRIVE_ROOT);
        const second = issueFresh(store, FOLDER_A);

        expect(first).not.toBe(second);
        expect(store.redeem(first, DRIVE_ROOT).nextLink).toBe(LINK_1);
        expect(store.redeem(second, FOLDER_A).nextLink).toBe(LINK_1);
    });

    test('tokens are not sequential enough to guess another view\'s handle', () => {
        const store = new ContinuationStore();
        const a = issueFresh(store, FOLDER_A);
        const b = issueFresh(store, FOLDER_B);

        // The counter prefix may be predictable, but the random suffix must not be.
        expect(a.replace(/^c\d+-/, '')).not.toBe(b.replace(/^c\d+-/, ''));
        expect(a.replace(/^c\d+-/, '').length, 'the random part must be substantial').toBeGreaterThanOrEqual(16);
    });

    test('no token is issued for a final page', () => {
        const store = new ContinuationStore();
        const generation = store.beginListing(ROOT);

        expect(store.issue(ROOT, undefined, generation)).toBeUndefined();
        expect(store.issue(ROOT, '', generation)).toBeUndefined();
        expect(store.size, 'a final page must leave nothing redeemable behind').toBe(0);
    });

    test('mapCollectionPage never returns the server link to its caller', () => {
        const sink: (string | undefined)[] = [];

        const items = mapCollectionPage<{ id: string }, string>(
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
            { value: [{ id: 'a' }, { id: 'b' }], '@odata.nextLink': LINK_1 },
            (raw) => raw.id,
            (link) => sink.push(link)
        );

        expect(items).toEqual(['a', 'b']);
        expect(JSON.stringify(items)).not.toContain('skiptoken');
        expect(sink, 'the link goes to the host-side sink only').toEqual([LINK_1]);
    });

    test('mapCollectionPage reports "no next page" explicitly rather than staying silent', () => {
        const sink: (string | undefined)[] = [];

        mapCollectionPage<{ id: string }, string>({ value: [] }, (raw) => raw.id, (link) => sink.push(link));
        mapCollectionPage<{ id: string }, string>(null, (raw) => raw.id, (link) => sink.push(link));

        expect(sink).toEqual([undefined, undefined]);
    });
});

test.describe('AC-03 / AC-04 — unknown and cross-scope identifiers are rejected', () => {
    test('an unknown identifier is refused', () => {
        const store = new ContinuationStore();

        expectRejection(() => store.redeem('c1-forged', DRIVE_ROOT), 'a forged token must not redeem');
    });

    test('a raw Graph link offered as a token is refused', () => {
        const store = new ContinuationStore();

        expectRejection(() => store.redeem(LINK_1, DRIVE_ROOT), 'a nextLink is not a continuation');
    });

    for (const [label, value] of [
        ['an empty string', ''],
        ['null', null],
        ['a number', 7],
        ['an object', { token: 'x' }],
    ] as [string, unknown][]) {
        test(`${label} is refused as malformed`, () => {
            const store = new ContinuationStore();

            expectRejection(() => store.redeem(value, DRIVE_ROOT), `${label} must not redeem`);
        });
    }

    for (const [label, claimed] of [
        ['a sibling folder', FOLDER_B],
        ['the drive root', DRIVE_ROOT],
        ['another container', OTHER_CONTAINER],
        ['the recycle bin', RECYCLE],
        ['the container list', ROOT],
    ] as [string, CollectionScope][]) {
        test(`a folder token claimed by ${label} is refused`, () => {
            const store = new ContinuationStore();
            const token = issueFresh(store, FOLDER_A);

            expectRejection(() => store.redeem(token, claimed), `${label} must not append into folder-a`);
        });
    }

    test('the container list and the deleted-container list do not share continuations', () => {
        const store = new ContinuationStore();
        const token = issueFresh(store, ROOT);

        expectRejection(() => store.redeem(token, DELETED), 'deleted containers is a different view');
    });

    test('a refused redemption consumes the token, so it cannot be replayed with the right scope', () => {
        const store = new ContinuationStore();
        const token = issueFresh(store, FOLDER_A);

        expectRejection(() => store.redeem(token, FOLDER_B), 'cross-scope must be refused');
        expectRejection(() => store.redeem(token, FOLDER_A), 'a refused token must not survive');
    });

    test('a token from another panel is simply unknown', () => {
        const panelA = new ContinuationStore();
        const panelB = new ContinuationStore();
        const token = issueFresh(panelA, DRIVE_ROOT);

        expectRejection(() => panelB.redeem(token, DRIVE_ROOT), 'stores are per panel');
    });

    test('sameScope distinguishes every axis of a view', () => {
        expect(sameScope(FOLDER_A, { kind: 'driveChildren', containerId: 'b!c1', itemId: 'folder-a' })).toBe(true);
        expect(sameScope(FOLDER_A, FOLDER_B)).toBe(false);
        expect(sameScope(FOLDER_A, OTHER_CONTAINER)).toBe(false);
        expect(sameScope(DRIVE_ROOT, RECYCLE)).toBe(false);
        expect(sameScope(DRIVE_ROOT, FOLDER_A)).toBe(false);
        expect(sameScope(ROOT, DELETED)).toBe(false);
    });
});

test.describe('AC-04 — refresh and navigation retire stale continuations', () => {
    test('one click fetches exactly one page: a token is single-use', () => {
        const store = new ContinuationStore();
        const token = issueFresh(store, DRIVE_ROOT);

        expect(store.redeem(token, DRIVE_ROOT).nextLink).toBe(LINK_1);
        expectRejection(() => store.redeem(token, DRIVE_ROOT), 'a second click must not re-fetch the same page');
    });

    test('refreshing a view retires the token it had handed out', () => {
        const store = new ContinuationStore();
        const stale = issueFresh(store, DRIVE_ROOT);

        store.beginListing(DRIVE_ROOT);

        expectRejection(() => store.redeem(stale, DRIVE_ROOT), 'a pre-refresh token must not append');
        expect(store.size).toBe(0);
    });

    test('a page that arrives after a refresh yields no token at all', () => {
        const store = new ContinuationStore();
        const generation = store.beginListing(FOLDER_A);

        // The user refreshed while the first request was still in flight.
        store.beginListing(FOLDER_A);

        expect(
            store.issue(FOLDER_A, LINK_1, generation),
            'offering Load more for a superseded listing would append rows the user cannot see'
        ).toBeUndefined();
    });

    test('re-navigating into a folder retires the token from the previous visit', () => {
        const store = new ContinuationStore();
        const first = issueFresh(store, FOLDER_A);

        store.beginListing(FOLDER_B);      // navigate away
        store.beginListing(FOLDER_A);      // and back

        expectRejection(() => store.redeem(first, FOLDER_A), 'the earlier visit\'s token is stale');
    });

    test('refreshing one view leaves other views\' continuations intact', () => {
        const store = new ContinuationStore();
        const folderToken = issueFresh(store, FOLDER_A);
        const rootToken = issueFresh(store, ROOT);

        store.beginListing(FOLDER_A);

        expectRejection(() => store.redeem(folderToken, FOLDER_A), 'the refreshed view is retired');
        expect(store.redeem(rootToken, ROOT).nextLink, 'an unrelated view must be untouched').toBe(LINK_1);
    });

    test('a failed page fetch reinstates the token so a retry does not skip the page', () => {
        const store = new ContinuationStore();
        const token = issueFresh(store, DRIVE_ROOT, LINK_2);

        const record = store.redeem(token, DRIVE_ROOT);
        store.reinstate(token, record);   // the Graph call failed

        expect(store.redeem(token, DRIVE_ROOT).nextLink, 'the retry must fetch the same page').toBe(LINK_2);
    });

    test('a token is not reinstated if the view was refreshed while the fetch was failing', () => {
        const store = new ContinuationStore();
        const token = issueFresh(store, DRIVE_ROOT);
        const record = store.redeem(token, DRIVE_ROOT);

        store.beginListing(DRIVE_ROOT);
        store.reinstate(token, record);

        expectRejection(() => store.redeem(token, DRIVE_ROOT), 'a retry into a refreshed view must not append');
        expect(store.size).toBe(0);
    });

    test('a reinstated token is still bound to its original view', () => {
        const store = new ContinuationStore();
        const token = issueFresh(store, FOLDER_A);
        const record = store.redeem(token, FOLDER_A);
        store.reinstate(token, record);

        expectRejection(() => store.redeem(token, FOLDER_B), 'reinstating must not widen the binding');
    });
});
