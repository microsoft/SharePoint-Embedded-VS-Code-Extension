import type { ColumnDefinition } from '@microsoft/microsoft-graph-types';
import { request } from '../rpc';

/** Container column definitions and drive item column values, executed by the extension host. */
export class ColumnGraphService {
    // ── Container (drive) columns ─────────────────────────────────────────────

    /** List all column definitions on a container's drive. */
    async listContainerColumns(containerId: string): Promise<ColumnDefinition[]> {
        return request('columns.listContainerColumns', { containerId });
    }

    /** Add a column definition to a container's drive. */
    async createContainerColumn(
        containerId: string,
        column: Partial<ColumnDefinition>,
    ): Promise<ColumnDefinition> {
        return request('columns.createContainerColumn', { containerId, column });
    }

    /** Update a column definition on a container's drive. */
    async updateContainerColumn(
        containerId: string,
        columnId: string,
        column: Partial<ColumnDefinition>,
    ): Promise<ColumnDefinition> {
        return request('columns.updateContainerColumn', { containerId, columnId, column });
    }

    /** Delete a column definition from a container's drive. */
    async deleteContainerColumn(containerId: string, columnId: string): Promise<void> {
        return request('columns.deleteContainerColumn', { containerId, columnId });
    }

    // ── Drive item custom columns (listItem fields) ───────────────────────────

    /** Get the column values (fields) for a drive item's list item. */
    async getItemFields(driveId: string, itemId: string): Promise<Record<string, unknown>> {
        return request('columns.getItemFields', { driveId, itemId });
    }

    /**
     * Update column values (fields) for a drive item's list item.
     * Pass null for any field to unset it.
     */
    async updateItemFields(
        driveId: string,
        itemId: string,
        fields: Record<string, unknown>,
    ): Promise<void> {
        return request('columns.updateItemFields', { driveId, itemId, fields });
    }
}
