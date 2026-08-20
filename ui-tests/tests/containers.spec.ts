/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '../fixtures';
import {
    ContainerConsistencyMock,
    installContainerConsistencyMock,
} from '../helpers/mock/containerConsistency';
import { StorageExplorerWebview } from '../pages/StorageExplorerWebview';
import { TID } from '../testids';

const CONTAINER_COLLECTION = /\/storage\/fileStorage\/containers$/;
const CONTAINER_ITEM = /\/storage\/fileStorage\/containers\/[^/]+$/;
const CONTAINER_ACTIVATE = /\/storage\/fileStorage\/containers\/[^/]+\/activate$/;

async function settlePage(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function createLocallyTrackedContainer(
    storage: StorageExplorerWebview,
    mock: ContainerConsistencyMock,
    name: string,
): Promise<string> {
    mock.freezeContainerCollection();
    await storage.createContainer(name);
    const container = mock.containers.find(item => item.displayName === name);
    if (!container) {
        throw new Error(`Mock create did not add ${name}`);
    }
    return container.id;
}

test.describe('Containers', () => {
    test('create → assert row appears', async ({ storage }) => {
        const name = `ct-create-${Date.now()}`;
        await storage.createContainer(name, 'Created by SPE UI automation');
        await expect(storage.row(name)).toBeVisible();
    });

    test('rename a container', async ({ storage }) => {
        const name = `ct-rename-${Date.now()}`;
        const renamed = `${name}-renamed`;
        await storage.createContainer(name);
        await storage.renameContainer(name, renamed);
        await expect(storage.row(renamed)).toBeVisible();
        await expect(storage.row(name)).toHaveCount(0);
    });

    test('activate an inactive container from the action bar', async ({ storage }) => {
        const name = `ct-activate-${Date.now()}`;
        // Newly created containers come back inactive, and Graph's container list omits
        // `status` — the action bar must enrich the selection before gating "Activate".
        await storage.createContainer(name);
        await storage.select(name);
        await expect(storage.tid(TID.actionActivateContainer)).toBeVisible({ timeout: 30_000 });

        await storage.tid(TID.actionActivateContainer).click();
        await expect(storage.tid(TID.actionActivateContainer)).toHaveCount(0, { timeout: 30_000 });
    });

    test('activate an inactive container from a checkbox selection', async ({ storage }) => {
        const name = `ct-activate-cb-${Date.now()}`;
        await storage.createContainer(name);
        // Ticking the checkbox is a separate path from clicking the row: it populates
        // `selectedIds`, not `selectedItem`, and must enrich `status` on its own — otherwise
        // the bulk Activate button can never meet its `status === 'inactive'` condition.
        await storage.check(name);
        await expect(storage.tid(TID.selectionCount)).toHaveText('1 selected');

        await expect(storage.tid(TID.bulkActivateContainer)).toBeVisible({ timeout: 30_000 });
        await storage.tid(TID.bulkActivateContainer).click();

        // Activating clears the selection, so the whole bulk bar goes away.
        await expect(storage.tid(TID.bulkActivateContainer)).toHaveCount(0, { timeout: 30_000 });
        await expect(storage.tid(TID.selectionCount)).toHaveCount(0);

        // ...and it really is active now: re-selecting offers no Activate on either path.
        await storage.select(name);
        await expect(storage.tid(TID.actionDeleteContainer)).toBeEnabled();
        await expect(storage.tid(TID.actionActivateContainer)).toHaveCount(0);
    });

    test('no activate button when a checkbox selection spans more than one container', async ({ storage }) => {
        const a = `ct-multi-a-${Date.now()}`;
        const b = `ct-multi-b-${Date.now()}`;
        await storage.createContainer(a);
        await storage.createContainer(b);

        await storage.check(a);
        await expect(storage.tid(TID.bulkActivateContainer)).toBeVisible({ timeout: 30_000 });

        await storage.check(b);
        await expect(storage.tid(TID.selectionCount)).toHaveText('2 selected');
        await expect(storage.tid(TID.bulkActivateContainer)).toHaveCount(0);
    });

    test('delete a container → moves to deleted containers → restore', async ({ storage }) => {
        const name = `ct-del-${Date.now()}`;
        await storage.createContainer(name);
        await storage.deleteContainer(name);

        await storage.openDeletedContainers();
        await expect(storage.recycledRow(name)).toBeVisible({ timeout: 30_000 });

        await storage.recycledRow(name).click();
        await storage.restoreSelected();
        await expect(storage.recycledRow(name)).toHaveCount(0, { timeout: 30_000 });
    });

    test('keeps a successfully created container visible while collection responses are stale', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const name = `ct-stale-${Date.now()}`;
        await createLocallyTrackedContainer(storage, mock, name);

        await expect(storage.row(name)).toBeVisible();
        await storage.refreshContainers();
        await expect(storage.row(name)).toBeVisible();
        await storage.refreshContainers();
        await expect(storage.row(name)).toBeVisible();
    });

    test('reconciles a locally tracked container once authoritative enumeration catches up', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const localName = `ct-reconcile-${Date.now()}`;
        const authoritativeName = `${localName}-authoritative`;
        const id = await createLocallyTrackedContainer(storage, mock, localName);

        const authoritative = mock.findContainer(id);
        if (!authoritative) {
            throw new Error(`Missing consistency-mock container: ${id}`);
        }
        authoritative.displayName = authoritativeName;
        authoritative.description = 'Authoritative collection value';
        mock.releaseContainer(id);

        await storage.refreshContainers();

        await expect(storage.row(localName)).toHaveCount(0);
        await expect(storage.row(authoritativeName)).toHaveCount(1);
        await expect(page.locator(`[data-item-id="${id}"]`)).toHaveCount(1);
    });

    test('does not apply failed create, rename, activate, or delete operations locally', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        mock.freezeContainerCollection();

        const failedCreate = `ct-create-fail-${Date.now()}`;
        mock.failNextRequest('POST', CONTAINER_COLLECTION);
        await storage.tid(TID.actionNewContainer).click();
        await storage.tid(TID.newContainerNameInput).fill(failedCreate);
        const createResponse = page.waitForResponse(response =>
            response.request().method() === 'POST'
            && CONTAINER_COLLECTION.test(new URL(response.url()).pathname)
        );
        await storage.tid(TID.modalConfirm).click();
        await (await createResponse).finished();
        await settlePage(page);
        await storage.dismissModalIfOpen();
        await expect(storage.row(failedCreate)).toHaveCount(0);

        const original = `ct-mutation-fail-${Date.now()}`;
        await storage.createContainer(original);
        await expect(storage.row(original)).toBeVisible();

        const failedRename = `${original}-renamed`;
        mock.failNextRequest('PATCH', CONTAINER_ITEM);
        await storage.select(original);
        await storage.tid(TID.actionRenameContainer).click();
        await storage.tid(TID.renameInput).fill(failedRename);
        const renameResponse = page.waitForResponse(response =>
            response.request().method() === 'PATCH'
            && CONTAINER_ITEM.test(new URL(response.url()).pathname)
        );
        await storage.tid(TID.modalConfirm).click();
        await (await renameResponse).finished();
        await settlePage(page);
        await storage.dismissModalIfOpen();
        await expect(storage.row(original)).toBeVisible();
        await expect(storage.row(failedRename)).toHaveCount(0);

        mock.failNextRequest('POST', CONTAINER_ACTIVATE);
        await storage.select(original);
        await expect(storage.tid(TID.actionActivateContainer)).toBeVisible();
        const activateResponse = page.waitForResponse(response =>
            response.request().method() === 'POST'
            && CONTAINER_ACTIVATE.test(new URL(response.url()).pathname)
        );
        await storage.tid(TID.actionActivateContainer).click();
        await (await activateResponse).finished();
        await settlePage(page);
        await expect(storage.tid(TID.actionActivateContainer)).toBeVisible();

        mock.failNextRequest('DELETE', CONTAINER_ITEM);
        await storage.select(original);
        await storage.tid(TID.actionDeleteContainer).click();
        const deleteResponse = page.waitForResponse(response =>
            response.request().method() === 'DELETE'
            && CONTAINER_ITEM.test(new URL(response.url()).pathname)
        );
        await storage.tid(TID.modalConfirm).click();
        await (await deleteResponse).finished();
        await settlePage(page);
        await storage.dismissModalIfOpen();
        await expect(storage.row(original)).toBeVisible();
    });

    test('updates successful local rename, activation, selection, and deletion without enumeration', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const name = `ct-local-mutate-${Date.now()}`;
        const renamed = `${name}-renamed`;
        await createLocallyTrackedContainer(storage, mock, name);

        await storage.renameContainer(name, renamed);
        await expect(storage.row(name)).toHaveCount(0);
        await expect(storage.row(renamed)).toBeVisible();
        await expect(storage.tid(TID.actionDeleteContainer)).toBeEnabled();

        await expect(storage.tid(TID.actionActivateContainer)).toBeVisible();
        await storage.tid(TID.actionActivateContainer).click();
        await expect(storage.tid(TID.actionActivateContainer)).toHaveCount(0);
        await expect(storage.tid(TID.actionDeleteContainer)).toBeEnabled();

        await storage.deleteContainer(renamed);
        await expect(storage.row(renamed)).toHaveCount(0);
        await storage.refreshContainers();
        await expect(storage.row(renamed)).toHaveCount(0);
    });

    test('does not resurrect a deleted container while collection responses remain stale', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const name = `ct-stale-delete-${Date.now()}`;
        const id = await createLocallyTrackedContainer(storage, mock, name);

        mock.releaseContainer(id);
        await storage.refreshContainers();
        await expect(storage.row(name)).toBeVisible();

        mock.keepDeletedContainerInCollection(id);
        await storage.deleteContainer(name);
        await expect(storage.row(name)).toHaveCount(0);
        await storage.refreshContainers();
        await expect(storage.row(name)).toHaveCount(0);

        mock.completeContainerDeletion(id);
        await storage.refreshContainers();
        await expect(storage.row(name)).toHaveCount(0);
    });

    test('shows a restored container after stale deletion responses created a tombstone', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const name = `ct-stale-restore-${Date.now()}`;
        const id = await createLocallyTrackedContainer(storage, mock, name);

        mock.releaseContainer(id);
        await storage.refreshContainers();
        mock.keepDeletedContainerInCollection(id);
        await storage.deleteContainer(name);
        await expect(storage.row(name)).toHaveCount(0);

        await storage.openDeletedContainers();
        await expect(storage.recycledRow(name)).toBeVisible();
        await storage.recycledRow(name).click();
        await storage.restoreSelected();
        await expect(storage.recycledRow(name)).toHaveCount(0);

        await storage.breadcrumbTo(0);
        await storage.refreshContainers();
        await expect(storage.row(name)).toBeVisible();
    });

    test('retains a local create through a failed collection request and successful retry', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const name = `ct-list-retry-${Date.now()}`;
        const id = await createLocallyTrackedContainer(storage, mock, name);

        mock.failNextRequest('GET', CONTAINER_COLLECTION);
        const failedCollection = page.waitForResponse(response =>
            response.request().method() === 'GET'
            && CONTAINER_COLLECTION.test(new URL(response.url()).pathname)
        );
        await storage.tid(TID.navRefresh).click();
        const failedResponse = await failedCollection;
        expect(failedResponse.status()).toBe(500);
        await failedResponse.finished();
        await settlePage(page);
        await expect(storage.row(name)).toBeVisible({ timeout: 30_000 });

        mock.releaseContainer(id);
        await storage.refreshContainers();
        await expect(storage.row(name)).toHaveCount(1);
        await expect(page.locator(`[data-item-id="${id}"]`)).toHaveCount(1);
    });

    test('does not let a late pre-create collection response erase the created row', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        mock.freezeContainerCollection();
        const delayed = mock.delayNextContainerCollection();
        const staleResponse = page.waitForResponse(response =>
            response.request().method() === 'GET'
            && CONTAINER_COLLECTION.test(new URL(response.url()).pathname)
        );

        await storage.tid(TID.navRefresh).click();
        await delayed.started;

        const name = `ct-race-${Date.now()}`;
        await storage.createContainer(name);
        await expect(storage.row(name)).toBeVisible();

        delayed.release();
        await (await staleResponse).finished();
        await settlePage(page);
        await expect(storage.tid(TID.listLoading)).toHaveCount(0, { timeout: 30_000 });
        await expect(storage.row(name)).toBeVisible();
    });

    test('supports filtering, sorting, checkbox selection, and navigation for local containers', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        mock.freezeContainerCollection();
        const prefix = `ct-local-interactions-${Date.now()}`;
        const alpha = `${prefix}-a`;
        const zulu = `${prefix}-z`;
        await storage.createContainer(zulu);
        await storage.createContainer(alpha);

        await storage.search(prefix);
        await expect(storage.row(alpha)).toBeVisible();
        await expect(storage.row(zulu)).toBeVisible();

        // Locally created rows are pinned newest-first and deliberately ignore the chosen sort
        // (so a container you just made is never buried). Release them into the authoritative
        // collection first, otherwise the Name header has nothing sortable to act on.
        for (const name of [alpha, zulu]) {
            const created = mock.containers.find(item => item.displayName === name);
            if (!created) { throw new Error(`Mock create did not add ${name}`); }
            mock.releaseContainer(created.id);
        }
        await storage.refreshContainers();

        const visibleOrder = page.locator('[data-item-id]:visible');
        const rowOrder = async (): Promise<string[]> =>
            visibleOrder.evaluateAll(rows => rows.map(row => row.getAttribute('data-testid') ?? ''));
        const ascending = [TID.fileRow(alpha), TID.fileRow(zulu)];
        const descending = [...ascending].reverse();

        await storage.tid(TID.sortName).click();
        await expect.poll(rowOrder).toEqual(ascending);

        await storage.tid(TID.sortName).click();
        await expect.poll(rowOrder).toEqual(descending);

        await storage.check(alpha);
        await expect(storage.tid(TID.selectionCount)).toHaveText('1 selected');
        await expect(storage.tid(TID.bulkActivateContainer)).toBeVisible();
        await storage.tid(TID.bulkClear).click();

        await storage.clearSearch();
        await storage.openContainer(alpha);
        await expect(storage.tid(TID.actionNewDropdown)).toBeVisible();
    });

    test('cancelling create does not add local state', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        mock.freezeContainerCollection();
        const name = `ct-create-cancel-${Date.now()}`;

        await storage.tid(TID.actionNewContainer).click();
        await storage.tid(TID.newContainerNameInput).fill(name);
        await storage.tid(TID.modalCancel).click();

        await expect(storage.row(name)).toHaveCount(0);
        expect(mock.containers.some(container => container.displayName === name)).toBe(false);
    });

    test('does not persist locally tracked containers across webview sessions', async ({ storage, page }) => {
        const mock = await installContainerConsistencyMock(page);
        const name = `ct-session-only-${Date.now()}`;
        await createLocallyTrackedContainer(storage, mock, name);
        await expect(storage.row(name)).toBeVisible();

        await page.reload();
        await storage.waitUntilReady();

        await expect(storage.row(name)).toHaveCount(0);
        expect(mock.containers.some(container => container.displayName === name)).toBe(true);
    });
});
