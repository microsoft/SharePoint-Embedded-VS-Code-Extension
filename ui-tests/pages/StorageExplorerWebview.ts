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

    async openDeletedContainers(): Promise<void> {
        await this.tid(TID.actionDeletedContainers).click();
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
}
