import { Client } from '@microsoft/microsoft-graph-client';
import type { ColumnDefinition } from '@microsoft/microsoft-graph-types';
import { WebviewAuthProvider } from '../WebviewAuthProvider';
import { withAuthRetry } from '../GraphClient';

export class ColumnGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
    ) {}

    // ── Container (drive) columns ─────────────────────────────────────────────

    /** List all column definitions on a container's drive. */
    async listContainerColumns(containerId: string): Promise<ColumnDefinition[]> {
        return withAuthRetry(this._authProvider, async () => {
            const result = await this._client
                .api(`/storage/fileStorage/containers/${containerId}/columns`)
                .get();
            const cols: ColumnDefinition[] = result.value ?? [];
            // 'Description' is a built-in SPE column that the API incorrectly
            // reports as deletable. Override it so the UI treats it correctly.
            return cols.map(c =>
                c.name === '_ExtendedDescription' ? { ...c, isDeletable: false } : c
            );
        });
    }

    /** Add a column definition to a container's drive. */
    async createContainerColumn(
        containerId: string,
        column: Partial<ColumnDefinition>,
    ): Promise<ColumnDefinition> {
        return withAuthRetry(this._authProvider, async () => {
            return this._client
                .api(`/storage/fileStorage/containers/${containerId}/columns`)
                .post(column);
        });
    }

    /** Update a column definition on a container's drive. */
    async updateContainerColumn(
        containerId: string,
        columnId: string,
        column: Partial<ColumnDefinition>,
    ): Promise<ColumnDefinition> {
        return withAuthRetry(this._authProvider, async () => {
            return this._client
                .api(`/storage/fileStorage/containers/${containerId}/columns/${columnId}`)
                .patch(column);
        });
    }

    /** Delete a column definition from a container's drive. */
    async deleteContainerColumn(containerId: string, columnId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/storage/fileStorage/containers/${containerId}/columns/${columnId}`)
                .delete();
        });
    }

    // ── Drive item custom columns (listItem fields) ───────────────────────────

    /** Get the column values (fields) for a drive item's list item. */
    async getItemFields(_driveId: string, _itemId: string): Promise<Record<string, unknown>> {
        throw new Error('ColumnGraphService.getItemFields: not yet implemented');
    }

    /** Update column values (fields) for a drive item's list item. */
    async updateItemFields(
        _driveId: string,
        _itemId: string,
        _fields: Record<string, unknown>,
    ): Promise<void> {
        throw new Error('ColumnGraphService.updateItemFields: not yet implemented');
    }
}

