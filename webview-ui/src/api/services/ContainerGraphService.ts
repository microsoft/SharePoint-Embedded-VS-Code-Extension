import type { FileStorageContainerSettings } from '@microsoft/microsoft-graph-types';
import { request } from '../rpc';
import type { ContainerCustomProperties, PagedResult, StorageItem } from '../protocol';

/**
 * SPE container operations.
 *
 * Every method forwards to the extension host, which owns the Graph token.
 * Container-type-scoped calls (`list`, `listDeleted`, `create`) deliberately take no
 * container type id: the host uses the one the panel was opened with.
 *
 * Listings return **one server page**. The `continuation` handle in the result is opaque —
 * the Graph `@odata.nextLink` never leaves the extension host — and is redeemed by
 * `loadMore` only when the user explicitly asks for the next page.
 */
export class ContainerGraphService {
    /** List the first page of active containers for this panel's container type. */
    async list(): Promise<PagedResult<StorageItem>> {
        return request('containers.list', {});
    }

    /** Get a single container by ID. */
    async get(containerId: string): Promise<StorageItem | null> {
        return request('containers.get', { containerId });
    }

    /** Create a new container under this panel's container type. */
    async create(displayName: string, description?: string): Promise<StorageItem> {
        return request('containers.create', { displayName, description });
    }

    /** Activate an inactive container without uploading content. */
    async activate(containerId: string): Promise<void> {
        return request('containers.activate', { containerId });
    }

    /** Rename a container. */
    async rename(containerId: string, displayName: string): Promise<void> {
        return request('containers.rename', { containerId, displayName });
    }

    /** Update a container's description. */
    async updateDescription(containerId: string, description: string): Promise<void> {
        return request('containers.updateDescription', { containerId, description });
    }

    /** Soft-delete (recycle) a container. */
    async delete(containerId: string): Promise<void> {
        return request('containers.delete', { containerId });
    }

    /** List the first page of soft-deleted containers for this panel's container type. */
    async listDeleted(): Promise<PagedResult<StorageItem>> {
        return request('containers.listDeleted', {});
    }

    /** Restore a soft-deleted container. */
    async restore(containerId: string): Promise<void> {
        return request('containers.restore', { containerId });
    }

    /** Permanently delete a soft-deleted container. */
    async permanentlyDelete(containerId: string): Promise<void> {
        return request('containers.permanentlyDelete', { containerId });
    }

    /** Get retention label / version settings for a container. */
    async getSettings(containerId: string): Promise<FileStorageContainerSettings> {
        return request('containers.getSettings', { containerId });
    }

    /** Update retention / versioning settings for a container. */
    async updateSettings(
        containerId: string,
        settings: Partial<FileStorageContainerSettings>,
    ): Promise<void> {
        return request('containers.updateSettings', { containerId, settings });
    }

    // ── Custom properties ─────────────────────────────────────────────────────

    /** Get all custom properties for a container. */
    async getCustomProperties(containerId: string): Promise<ContainerCustomProperties> {
        return request('containers.getCustomProperties', { containerId });
    }

    /** Set or update a single custom property. */
    async setCustomProperty(
        containerId: string,
        key: string,
        value: string,
        isSearchable: boolean,
    ): Promise<void> {
        return request('containers.setCustomProperty', { containerId, key, value, isSearchable });
    }

    /** Delete a custom property. */
    async deleteCustomProperty(containerId: string, key: string): Promise<void> {
        return request('containers.deleteCustomProperty', { containerId, key });
    }
}
