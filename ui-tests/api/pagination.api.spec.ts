/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Host-side pagination contract (AC-01, AC-03, AC-04, AC-09).
 *
 * Storage Explorer collections must fetch exactly one Graph page per user-visible load, and the
 * raw `@odata.nextLink` must never leave the host: the webview may only ever hold an opaque
 * continuation identifier.
 */

import { test, expect } from '@playwright/test';
import { Client } from '@microsoft/microsoft-graph-client';
import { ContainerGraphService } from '../../src/services/StorageExplorer/ContainerGraphService';
import { DriveGraphService } from '../../src/services/StorageExplorer/DriveGraphService';
import { StorageExplorerApi } from '../../src/services/StorageExplorer/StorageExplorerApi';
import type { GraphPage } from '../../src/services/StorageExplorer/pagination';
import type { ContainerTypeAppPermission } from '../../src/models/schemas';
import { FakeGraphClient, RecordedCall } from './fakeClient';

const CONTAINER_TYPE_ID = 'ct-1';

/**
 * A grant reader for the capability matrix. Injected so a pagination test exercises paging,
 * not the grant lookup; authorization itself is covered by `capability-matrix.api.spec.ts`.
 */
function grants(...scopes: ContainerTypeAppPermission[]) {
    return async () => scopes;
}
const DRIVE_ID = 'b!drive1';

/** A next-page URL that must never appear in anything handed to the webview. */
const NEXT_LINK = 'https://graph.microsoft.com/v1.0/drives/b!drive1/root/children?$skiptoken=PAGE2';

/**
 * Responder for a three-page server. Every GET answers with a page plus an `@odata.nextLink`
 * unless it already is the last page, so a caller that follows links automatically issues three
 * requests and a caller that stops after the first issues one.
 */
function threePages(makeItem: (n: number) => Record<string, unknown>) {
    return (call: RecordedCall): unknown => {
        const token = /\$skiptoken=PAGE(\d)/.exec(call.path)?.[1];
        const pageNumber = token ? Number(token) : 1;
        const value = [makeItem(pageNumber * 10), makeItem(pageNumber * 10 + 1)];
        return pageNumber < 3
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
            ? { value, '@odata.nextLink': `https://graph.microsoft.com/v1.0/next?$skiptoken=PAGE${pageNumber + 1}` }
            : { value };
    };
}

const container = (n: number) => ({
    id: `b!c${n}`,
    displayName: `Container ${n}`,
    containerTypeId: CONTAINER_TYPE_ID,
    createdDateTime: '2024-01-01T00:00:00Z',
});

const driveItem = (n: number) => ({
    id: `i${n}`,
    name: `File ${n}.txt`,
    size: 10,
    createdDateTime: '2024-01-01T00:00:00Z',
    lastModifiedDateTime: '2024-01-01T00:00:00Z',
    webUrl: 'https://contoso.sharepoint.com/x',
    file: { mimeType: 'text/plain' },
});

/** Assert nothing that could let the webview call Graph directly is present in `payload`. */
function expectNoNextLinkLeak(payload: unknown): void {
    const serialized = JSON.stringify(payload ?? null);
    expect(serialized).not.toContain('@odata.nextLink');
    expect(serialized).not.toContain('skiptoken');
    expect(serialized).not.toContain('graph.microsoft.com');
    expect(serialized).not.toContain('nextLink');
}

/**
 * The host keeps the server link for itself: the page states it explicitly, it was not
 * followed, and none of the mapped items contains a Graph URL.
 *
 * The link rides on the returned {@link GraphPage} envelope rather than on the items —
 * `StorageExplorerApi` exchanges it for an opaque continuation before anything crosses the
 * webview boundary, which is asserted separately below.
 */
function expectHostKeptTheLink(page: GraphPage<unknown>): void {
    expect(page.nextLink, 'the host must retain the server link for an explicit next page').toBeTruthy();
    expect(page.nextLink).toContain('skiptoken');
    expectNoNextLinkLeak(page.items);
}

/**
 * Answer container-scope verification (`GET /storage/fileStorage/containers/{id}`) with a
 * container that belongs to this panel's type, and delegate everything else to `inner`.
 * Without this the host's scope check rejects the call before the behaviour under test runs.
 */
function withContainerScope(containerId: string, inner: (call: RecordedCall) => unknown) {
    return (call: RecordedCall): unknown => {
        if (call.method === 'GET' && call.path === `/storage/fileStorage/containers/${containerId}`) {
            return { id: containerId, displayName: 'Scoped', containerTypeId: CONTAINER_TYPE_ID };
        }
        return inner(call);
    };
}

test.describe('AC-01 — collections load exactly one Graph page', () => {
    test('ContainerGraphService.list() stops after the first page', async () => {
        const fake = new FakeGraphClient();
        fake.responder = threePages(container);
        const service = new ContainerGraphService(fake as unknown as Client);

        const page = await service.list(CONTAINER_TYPE_ID);

        expect(fake.calls).toHaveLength(1);
        expect(page.items).toHaveLength(2);
        expectHostKeptTheLink(page);
    });

    test('ContainerGraphService.listDeleted() stops after the first page', async () => {
        const fake = new FakeGraphClient();
        fake.responder = threePages(container);
        const service = new ContainerGraphService(fake as unknown as Client);

        const page = await service.listDeleted(CONTAINER_TYPE_ID);

        expect(fake.calls).toHaveLength(1);
        expect(page.items).toHaveLength(2);
        expectHostKeptTheLink(page);
    });

    test('DriveGraphService.listChildren() stops after the first page at the drive root', async () => {
        const fake = new FakeGraphClient();
        fake.responder = threePages(driveItem);
        const service = new DriveGraphService(fake as unknown as Client);

        const page = await service.listChildren(DRIVE_ID, undefined);

        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].path).toBe(`/drives/${DRIVE_ID}/root/children`);
        expect(page.items).toHaveLength(2);
        expectHostKeptTheLink(page);
    });

    test('DriveGraphService.listChildren() stops after the first page inside a folder', async () => {
        const fake = new FakeGraphClient();
        fake.responder = threePages(driveItem);
        const service = new DriveGraphService(fake as unknown as Client);

        const page = await service.listChildren(DRIVE_ID, 'folder-1');

        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].path).toBe(`/drives/${DRIVE_ID}/items/folder-1/children`);
        expect(page.items).toHaveLength(2);
        expectHostKeptTheLink(page);
    });

    test('DriveGraphService.listRecycleBin() stops after the first page', async () => {
        const fake = new FakeGraphClient();
        fake.responder = threePages(driveItem);
        const service = new DriveGraphService(fake as unknown as Client);

        const page = await service.listRecycleBin('b!c1');

        expect(fake.calls).toHaveLength(1);
        expect(page.items).toHaveLength(2);
        expectHostKeptTheLink(page);
    });

    test('no collection call targets a server-supplied nextLink URL', async () => {
        const fake = new FakeGraphClient();
        fake.responder = () => ({
            value: [driveItem(1)],
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OData annotation name
            '@odata.nextLink': NEXT_LINK,
        });
        const drive = new DriveGraphService(fake as unknown as Client);
        const containers = new ContainerGraphService(fake as unknown as Client);

        await drive.listChildren(DRIVE_ID);
        await drive.listRecycleBin('b!c1');
        await containers.list(CONTAINER_TYPE_ID);
        await containers.listDeleted(CONTAINER_TYPE_ID);

        expect(fake.calls).toHaveLength(4);
        for (const call of fake.calls) {
            expect(call.path).not.toContain('http');
            expect(call.path).not.toContain('skiptoken');
        }
    });
});

test.describe('AC-03 / AC-04 — continuation identifiers are opaque and scope-bound', () => {
    function api() {
        const fake = new FakeGraphClient();
        fake.responder = threePages(container);
        return {
            fake,
            api: new StorageExplorerApi(CONTAINER_TYPE_ID, fake as unknown as Client, grants('read')),
        };
    }

    const context = { onProgress: () => { /* progress payloads are asserted separately */ } };

    test('containers.list issues one request and returns no Graph URL to the webview', async () => {
        const { fake, api: subject } = api();

        const result = await subject.execute('containers.list', {}, context);

        const listCalls = fake.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/storage/fileStorage/containers'));
        expect(listCalls).toHaveLength(1);
        expectNoNextLinkLeak(result);
    });

    test('drive.listChildren progress payloads carry no Graph URL', async () => {
        const fake = new FakeGraphClient();
        fake.responder = withContainerScope(DRIVE_ID, threePages(driveItem));
        const subject = new StorageExplorerApi(CONTAINER_TYPE_ID, fake as unknown as Client, grants('read'));
        const progress: unknown[] = [];

        const result = await subject.execute(
            'drive.listChildren',
            { driveId: DRIVE_ID },
            { onProgress: (data) => progress.push(data) }
        );

        expectNoNextLinkLeak(result);
        expectNoNextLinkLeak(progress);
    });

    /** Capture the rejection of a `collections.loadMore` the host must refuse. */
    async function expectRejectedLoadMore(
        subject: StorageExplorerApi,
        continuation: string
    ): Promise<Error> {
        const error = await subject
            .execute('collections.loadMore', { continuation, scope: { kind: 'containers' } }, context)
            .then(
                () => undefined,
                (rejection: unknown) => rejection as Error
            );

        // Silently ignoring attacker-supplied state and answering with a success-shaped page
        // would hide the rejection from the caller, so an explicit failure is required.
        expect(error, 'an unknown continuation must be rejected, not quietly ignored').toBeInstanceOf(Error);
        // The refusal must not echo the host's Graph state back to the webview.
        expect(error!.message).not.toContain('graph.microsoft.com');
        expect(error!.message).not.toContain('skiptoken');
        expect(error!.message).not.toContain('http');
        return error!;
    }

    test('a forged continuation identifier is rejected and never reaches Graph', async () => {
        const { fake, api: subject } = api();

        const error = await expectRejectedLoadMore(subject, 'forged');

        expect((error as { code?: unknown }).code, 'the rejection must be the typed continuation refusal')
            .toBe('invalidContinuation');
        // A refused continuation costs zero Graph requests: nothing was fetched at all.
        expect(fake.calls).toHaveLength(0);
    });

    test('a raw Graph nextLink supplied by the webview is rejected and never used as a request path', async () => {
        const { fake, api: subject } = api();

        const error = await expectRejectedLoadMore(subject, NEXT_LINK);

        expect((error as { code?: unknown }).code).toBe('invalidContinuation');
        expect(fake.calls).toHaveLength(0);
        for (const call of fake.calls) {
            expect(call.path).not.toContain('graph.microsoft.com');
            expect(call.path).not.toContain('skiptoken');
        }
    });

    test('a continuation issued for this panel cannot be replayed into another view', async () => {
        const { fake, api: subject } = api();

        const first = await subject.execute('containers.list', {}, context) as { continuation?: string };
        expect(first.continuation, 'a multi-page listing must offer a continuation').toBeTruthy();
        const callsAfterFirstPage = fake.calls.length;

        // Same token, a different collection kind: the binding must refuse it.
        const error = await subject
            .execute(
                'collections.loadMore',
                { continuation: first.continuation, scope: { kind: 'deletedContainers' } },
                context
            )
            .then(() => undefined, (rejection: unknown) => rejection as Error);

        expect(error, 'a cross-scope replay must be rejected').toBeInstanceOf(Error);
        expect((error as { code?: unknown }).code).toBe('invalidContinuation');
        expect(fake.calls).toHaveLength(callsAfterFirstPage);
    });
});

test.describe('AC-09 — mutations do not fetch unseen pages', () => {
    const context = { onProgress: () => { /* unused */ } };

    test('creating a container issues no continuation request', async () => {
        const fake = new FakeGraphClient();
        fake.responder = (call) => (call.method === 'POST'
            ? { id: 'b!new', displayName: 'New', containerTypeId: CONTAINER_TYPE_ID }
            : threePages(container)(call));
        const subject = new StorageExplorerApi(CONTAINER_TYPE_ID, fake as unknown as Client, grants('create'));

        const result = await subject.execute(
            'containers.create',
            { displayName: 'New' },
            context
        );

        expect(fake.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/storage/fileStorage/containers'))).toHaveLength(0);
        expectNoNextLinkLeak(result);
    });

    test('creating a folder issues no continuation request', async () => {
        const fake = new FakeGraphClient();
        fake.responder = withContainerScope(
            DRIVE_ID,
            () => ({ id: 'i-new', name: 'F', folder: { childCount: 0 } })
        );
        const subject = new StorageExplorerApi(
            CONTAINER_TYPE_ID,
            fake as unknown as Client,
            grants('read', 'writeContent')
        );

        await subject.execute(
            'drive.createFolder',
            { driveId: DRIVE_ID, parentId: null, name: 'F' },
            context
        );

        expect(fake.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/children'))).toHaveLength(0);
    });
});
