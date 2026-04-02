import { Client } from '@microsoft/microsoft-graph-client';
import type { FileStorageContainer, FileStorageContainerCustomPropertyValue, FileStorageContainerSettings } from '@microsoft/microsoft-graph-types';
import { StorageItem } from '../../models/StorageItem';
import { WebviewAuthProvider } from '../WebviewAuthProvider';
import { withAuthRetry } from '../GraphClient';
import type { ContainerCustomProperties } from '../../models/spe';

const BASE_PATH = '/storage/fileStorage/containers';
const DELETED_PATH = '/storage/fileStorage/deletedContainers';

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

function toStorageItem(c: FileStorageContainer): StorageItem {
    const raw = c as any;
    const quotaUsed: number | null | undefined = raw.drive?.quota?.used;
    return {
        id: c.id ?? '',
        name: c.displayName ?? '(unnamed)',
        kind: 'container',
        createdAt: formatDate(c.createdDateTime),
        modifiedAt: formatDate(c.createdDateTime),
        type: 'Container',
        size: formatBytes(quotaUsed),
        description: c.description ?? undefined,
        containerTypeId: c.containerTypeId ?? undefined,
        lockState: (c.lockState as StorageItem['lockState']) ?? null,
        status: (c.status as StorageItem['status']) ?? null,
        sensitivityLabel: raw.assignedSensitivityLabel ?? null,
    };
}

export class ContainerGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
    ) {}

    /** List all active containers for a given container type. */
    async list(containerTypeId: string): Promise<StorageItem[]> {
        return withAuthRetry(this._authProvider, async () => {
            const response = await this._client
                .api(BASE_PATH)
                .version('v1.0')
                .filter(`containerTypeId eq ${containerTypeId}`)
                .select('id,displayName,description,containerTypeId,createdDateTime,status,lockState,assignedSensitivityLabel')
                .expand('drive($select=quota)')
                .get();
            return (response.value as FileStorageContainer[]).map(toStorageItem);
        });
    }

    /** Get a single container by ID. */
    async get(containerId: string): Promise<StorageItem | null> {
        return withAuthRetry(this._authProvider, async () => {
            try {
                const c: FileStorageContainer = await this._client
                    .api(`${BASE_PATH}/${containerId}`)
                    .version('v1.0')
                    .select('id,displayName,description,containerTypeId,createdDateTime,status,lockState,assignedSensitivityLabel')
                    .expand('drive($select=quota)')
                    .get();
                return toStorageItem(c);
            } catch (err: any) {
                if (err?.statusCode === 404) return null;
                throw err;
            }
        });
    }

    /** Create a new container. */
    async create(containerTypeId: string, displayName: string, description?: string): Promise<StorageItem> {
        return withAuthRetry(this._authProvider, async () => {
            const body: Record<string, string> = { displayName, containerTypeId };
            if (description) body.description = description;
            const c: FileStorageContainer = await this._client
                .api(BASE_PATH)
                .version('v1.0')
                .post(body);
            return toStorageItem(c);
        });
    }

    /** Rename a container. */
    async rename(containerId: string, displayName: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${BASE_PATH}/${containerId}`)
                .version('v1.0')
                .patch({ displayName });
        });
    }

    /** Update a container's description. */
    async updateDescription(containerId: string, description: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${BASE_PATH}/${containerId}`)
                .version('v1.0')
                .patch({ description });
        });
    }

    /** Soft-delete (recycle) a container. */
    async delete(containerId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${BASE_PATH}/${containerId}`)
                .version('v1.0')
                .delete();
        });
    }

    /** List soft-deleted containers for a given container type. */
    async listDeleted(containerTypeId: string): Promise<StorageItem[]> {
        return withAuthRetry(this._authProvider, async () => {
            const response = await this._client
                .api(DELETED_PATH)
                .version('v1.0')
                .filter(`containerTypeId eq ${containerTypeId}`)
                .get();
            return (response.value as FileStorageContainer[]).map(c => ({
                ...toStorageItem(c),
                deletedAt: formatDate((c as any).deletedDateTime),
            }));
        });
    }

    /** Restore a soft-deleted container. */
    async restore(containerId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${DELETED_PATH}/${containerId}/restore`)
                .version('v1.0')
                .post({});
        });
    }

    /** Permanently delete a soft-deleted container. */
    async permanentlyDelete(containerId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${DELETED_PATH}/${containerId}`)
                .version('v1.0')
                .delete();
        });
    }

    /** Get retention label / version settings for a container. */
    async getSettings(containerId: string): Promise<FileStorageContainerSettings> {
        return withAuthRetry(this._authProvider, async () => {
            const result = await this._client
                .api(`${BASE_PATH}/${containerId}`)
                .select('settings')
                .get();
            return (result.settings ?? {}) as FileStorageContainerSettings;
        });
    }

    /** Update retention / versioning settings for a container. */
    async updateSettings(containerId: string, settings: Partial<FileStorageContainerSettings>): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${BASE_PATH}/${containerId}`)
                .patch({ settings });
        });
    }

    // ── Custom properties ─────────────────────────────────────────────────────

    /** Get all custom properties for a container. */
    async getCustomProperties(containerId: string): Promise<ContainerCustomProperties> {
        return withAuthRetry(this._authProvider, async () => {
            const result = await this._client
                .api(`${BASE_PATH}/${containerId}/customProperties`)
                .get();
            // The API returns the properties directly as an object (not wrapped in .value)
            // Strip OData metadata keys that start with '@'
            const out: ContainerCustomProperties = {};
            for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
                if (!k.startsWith('@')) {
                    out[k] = v as FileStorageContainerCustomPropertyValue;
                }
            }
            return out;
        });
    }

    /** Set or update a single custom property. */
    async setCustomProperty(
        containerId: string,
        key: string,
        value: string,
        isSearchable: boolean,
    ): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${BASE_PATH}/${containerId}/customProperties`)
                .patch({ [key]: { value, isSearchable } });
        });
    }

    /** Delete a custom property by patching its value to null. */
    async deleteCustomProperty(containerId: string, key: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`${BASE_PATH}/${containerId}/customProperties`)
                .patch({ [key]: null });
        });
    }
}
