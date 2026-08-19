/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Page, Locator, expect } from '@playwright/test';
import { TID } from '../testids';

/**
 * Page object for the Storage Explorer React app running standalone (Vite dev/preview server).
 * No iframe — the app IS the page. Selectors come from the shared `TID` constants.
 */
export class StorageExplorerWebview {
    constructor(private readonly page: Page) {}

    // ── Generic helpers ──────────────────────────────────────────────────────
    tid(id: string): Locator {
        return this.page.locator(`[data-testid="${id}"]`);
    }

    /** A FileList/container row keyed by item name. */
    row(name: string): Locator {
        return this.tid(TID.fileRow(name));
    }

    /** Select a row (enables its inline actions + action-bar buttons). */
    async select(name: string): Promise<void> {
        await this.row(name).click();
    }

    /**
     * Tick a row's checkbox. This is a different selection path from {@link select}: it feeds
     * `selectedIds` (bulk actions) rather than `selectedItem` (the detail panel), and
     * deliberately does not click the row.
     */
    async check(name: string): Promise<void> {
        await this.row(name).locator(`[data-testid="${TID.fileRowCheckbox}"]`).check();
    }

    async confirmModal(): Promise<void> {
        await this.tid(TID.modalConfirm).click();
        await expect(this.tid(TID.modal)).toHaveCount(0, { timeout: 30_000 });
    }

    /** Open a row's context menu (selects it first so inline actions are interactive). */
    async openRowMenu(name: string): Promise<void> {
        await this.select(name);
        await this.row(name).locator(`[data-testid="${TID.fileRowMenuBtn}"]`).click();
        await expect(this.tid(TID.contextMenu)).toBeVisible();
    }

    async clickMenuItem(key: string): Promise<void> {
        await this.tid(TID.contextMenuItem(key)).click();
    }

    // ── Container (root) view ────────────────────────────────────────────────
    async waitUntilReady(): Promise<void> {
        await expect(this.tid(TID.actionNewContainer)).toBeVisible({ timeout: 30_000 });
    }

    async createContainer(name: string, description?: string): Promise<void> {
        await this.tid(TID.actionNewContainer).click();
        await this.tid(TID.newContainerNameInput).fill(name);
        if (description) { await this.page.locator('#container-description').fill(description); }
        await this.confirmModal();
    }

    async renameContainer(name: string, newName: string): Promise<void> {
        await this.select(name);
        await this.tid(TID.actionRenameContainer).click();
        await this.tid(TID.renameInput).fill(newName);
        await this.confirmModal();
    }

    async deleteContainer(name: string): Promise<void> {
        await this.select(name);
        await this.tid(TID.actionDeleteContainer).click();
        await this.confirmModal();
        await expect(this.row(name)).toHaveCount(0, { timeout: 30_000 });
    }

    async refreshContainers(): Promise<void> {
        const response = this.page.waitForResponse(response =>
            response.request().method() === 'GET'
            && /\/storage\/fileStorage\/containers$/.test(new URL(response.url()).pathname)
        );
        await this.tid(TID.navRefresh).click();
        const completed = await response;
        await completed.finished();
        await this.page.evaluate(() => new Promise<void>(resolve =>
            requestAnimationFrame(() => resolve())));
        await expect(this.tid(TID.listLoading)).toHaveCount(0, { timeout: 30_000 });
    }

    async dismissModalIfOpen(): Promise<void> {
        if (await this.tid(TID.modal).count()) {
            await this.tid(TID.modalCancel).click();
            await expect(this.tid(TID.modal)).toHaveCount(0);
        }
    }

    async openDeletedContainers(): Promise<void> {
        await this.tid(TID.actionDeletedContainers).click();
    }

    /** Open the current container's recycle bin from the action bar (must be inside it). */
    async openRecycleBin(): Promise<void> {
        await this.tid(TID.actionRecycleBin).click();
    }

    /** Double-click a container to navigate into its drive. */
    async openContainer(name: string): Promise<void> {
        await this.row(name).dblclick();
        await expect(this.tid(TID.actionNewDropdown)).toBeVisible({ timeout: 30_000 });
    }

    /** Open a container-scoped side-panel tab via its context menu. */
    async openContainerTab(name: string, tab: string): Promise<void> {
        await this.openRowMenu(name);
        await this.clickMenuItem(tab);
        await expect(this.tid(TID.sidePanel)).toBeVisible({ timeout: 15_000 });
    }

    // ── Drive (files/folders) view ───────────────────────────────────────────

    /** Double-click a folder to navigate into it. */
    async openFolder(name: string): Promise<void> {
        await this.row(name).dblclick();
        await expect(this.tid(TID.breadcrumbItem(2))).toBeVisible({ timeout: 30_000 });
    }

    async newFolder(name: string): Promise<void> {
        await this.tid(TID.actionNewDropdown).click();
        await this.tid(TID.actionNewFolder).click();
        await this.tid(TID.newItemNameInput).fill(name);
        await this.confirmModal();
    }

    async newWordFile(name: string): Promise<void> {
        await this.tid(TID.actionNewDropdown).click();
        await this.tid(TID.actionNewWord).click();
        await this.tid(TID.newItemNameInput).fill(name);
        await this.confirmModal();
    }

    async renameItem(name: string, newName: string): Promise<void> {
        await this.select(name);
        await this.tid(TID.actionRenameItem).click();
        await this.tid(TID.renameInput).fill(newName);
        await this.confirmModal();
    }

    async deleteItem(name: string): Promise<void> {
        await this.select(name);
        await this.tid(TID.actionDeleteItem).click();
        await this.confirmModal();
        await expect(this.row(name)).toHaveCount(0, { timeout: 30_000 });
    }

    /** Open a file-scoped side-panel tab via its context menu. */
    async openItemTab(name: string, tab: string): Promise<void> {
        await this.openRowMenu(name);
        await this.clickMenuItem(tab);
        await expect(this.tid(TID.sidePanel)).toBeVisible({ timeout: 15_000 });
    }

    async breadcrumbTo(index: number): Promise<void> {
        await this.tid(TID.breadcrumbItem(index)).click();
    }

    // ── Recycle / deleted views ──────────────────────────────────────────────
    recycledRow(name: string): Locator {
        return this.tid(TID.recycledRow(name));
    }

    async restoreSelected(): Promise<void> {
        await this.tid(TID.recycledRestore).click();
    }

    async permanentlyDeleteSelected(): Promise<void> {
        await this.tid(TID.recycledPermanentDelete).click();
    }

    // ── Side panel ───────────────────────────────────────────────────────────
    sidePanel(): Locator {
        return this.tid(TID.sidePanel);
    }

    sidePanelTab(tab: string): Locator {
        return this.tid(TID.sidePanelTab(tab));
    }

    async switchTab(tab: string): Promise<void> {
        await this.sidePanelTab(tab).click();
    }

    // ── Search / filter ──────────────────────────────────────────────────────
    async search(text: string): Promise<void> {
        await this.tid(TID.searchInput).fill(text);
    }

    async clearSearch(): Promise<void> {
        await this.tid(TID.searchClear).click();
    }

    // ── Pagination ───────────────────────────────────────────────────────────

    /**
     * The explicit "Load more" affordance.
     *
     * Resolved by test id first and by accessible role+name second, so the assertion is on
     * the behaviour the acceptance criteria describe (an accessible button that loads the
     * next page) rather than on one particular markup choice.
     */
    loadMoreButton(): Locator {
        return this.page
            .locator(`[data-testid="${TID.loadMore}"], button:has-text("Load more"), [role="button"]:has-text("Load more")`)
            .first();
    }

    /**
     * Names of every currently rendered list row, in DOM (visual) order.
     *
     * Scoped by `[data-item-id]` because the per-row checkbox (`file-row-checkbox`) and
     * overflow button (`file-row-menu`) share the `file-row-` test-id prefix; matching on the
     * prefix alone would report three "rows" for every rendered item.
     */
    async rowNames(): Promise<string[]> {
        return this.page.$$eval('[data-testid^="file-row-"][data-item-id]', (nodes) =>
            nodes
                .map((n) => n.getAttribute('data-testid') ?? '')
                .filter((id) => id.startsWith('file-row-'))
                .map((id) => id.slice('file-row-'.length))
        );
    }

    /** Names of every currently rendered recycle-bin row, in DOM order. */
    async recycledRowNames(): Promise<string[]> {
        return this.page.$$eval('[data-testid^="recycled-row-"]', (nodes) =>
            nodes
                .map((n) => n.getAttribute('data-testid') ?? '')
                .filter((id) => id.startsWith('recycled-row-'))
                .map((id) => id.slice('recycled-row-'.length))
        );
    }

    /**
     * Click "Load more" and wait until the row count grows.
     *
     * Deliberately does not wait on a network response: whether a click issues a request at
     * all is exactly what the pagination specs assert, so waiting for one here would hide a
     * regression where the click silently does nothing.
     */
    async loadMore(): Promise<void> {
        const before = (await this.rowNames()).length;
        await this.loadMoreButton().click();
        await expect
            .poll(async () => (await this.rowNames()).length, { timeout: 15_000 })
            .toBeGreaterThan(before);
    }

    async sortBy(testId: string): Promise<void> {
        await this.tid(testId).click();
    }
}
