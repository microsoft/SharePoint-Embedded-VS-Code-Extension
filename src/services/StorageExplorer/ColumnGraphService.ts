/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import type { ColumnDefinition } from '@microsoft/microsoft-graph-types';

/** Container column definitions and drive item column values, executed on the extension host. */
export class ColumnGraphService {
    public constructor(private readonly _client: Graph.Client) { }

    // ── Container (drive) columns ─────────────────────────────────────────────

    /** List all column definitions on a container's drive. */
    public async listContainerColumns(containerId: string): Promise<ColumnDefinition[]> {
        const result = await this._client
            .api(`/storage/fileStorage/containers/${containerId}/columns`)
            .get();
        const cols: ColumnDefinition[] = result.value ?? [];
        // 'Description' is a built-in SPE column that the API incorrectly
        // reports as deletable. Override it so the UI treats it correctly.
        return cols.map(c =>
            c.name === '_ExtendedDescription' ? { ...c, isDeletable: false } : c
        );
    }

    /** Add a column definition to a container's drive. */
    public async createContainerColumn(
        containerId: string,
        column: Partial<ColumnDefinition>
    ): Promise<ColumnDefinition> {
        return this._client
            .api(`/storage/fileStorage/containers/${containerId}/columns`)
            .post(column);
    }

    /** Update a column definition on a container's drive. */
    public async updateContainerColumn(
        containerId: string,
        columnId: string,
        column: Partial<ColumnDefinition>
    ): Promise<ColumnDefinition> {
        return this._client
            .api(`/storage/fileStorage/containers/${containerId}/columns/${columnId}`)
            .patch(column);
    }

    /** Delete a column definition from a container's drive. */
    public async deleteContainerColumn(containerId: string, columnId: string): Promise<void> {
        await this._client
            .api(`/storage/fileStorage/containers/${containerId}/columns/${columnId}`)
            .delete();
    }

    // ── Drive item custom columns (listItem fields) ───────────────────────────

    /** Get the column values (fields) for a drive item's list item. */
    public async getItemFields(driveId: string, itemId: string): Promise<Record<string, unknown>> {
        return this._client
            .api(`/drives/${driveId}/items/${itemId}/listitem/fields`)
            .get();
    }

    /**
     * Update column values (fields) for a drive item's list item.
     * Pass null for any field to unset it.
     */
    public async updateItemFields(
        driveId: string,
        itemId: string,
        fields: Record<string, unknown>
    ): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}/listitem/fields`)
            .patch(fields);
    }
}
