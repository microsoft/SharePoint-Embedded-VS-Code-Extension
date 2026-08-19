/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import type {
    FileStorageContainer,
    FileStorageContainerCustomPropertyValue,
    FileStorageContainerSettings,
} from '@microsoft/microsoft-graph-types';
import { ContainerCustomProperties, StorageItem } from './protocol';
import { containerToStorageItem, formatDate } from './mappers';
import { DEFAULT_PAGE_SIZE, GraphPage, mapCollectionPage, RawCollectionResponse } from './pagination';

const BASE_PATH = '/storage/fileStorage/containers';
const DELETED_PATH = '/storage/fileStorage/deletedContainers';
const CONTAINER_SELECT =
    'id,displayName,description,containerTypeId,createdDateTime,status,lockState,assignedSensitivityLabel';

/** Deleted containers carry a `deletedDateTime` the shared container mapper does not read. */
function deletedContainerToStorageItem(container: FileStorageContainer): StorageItem {
    return {
        ...containerToStorageItem(container),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deletedAt: formatDate((container as any).deletedDateTime),
    };
}

/**
 * SPE container operations for the Storage Explorer, executed on the extension host.
 *
 * All container-type-scoped reads take the container type id from the caller
 * (`StorageExplorerApi` supplies the value bound to the panel) rather than from
 * the webview, so a compromised webview cannot enumerate a different container type.
 */
export class ContainerGraphService {
    public constructor(private readonly _client: Graph.Client) { }

    /**
     * List the **first page** of active containers for a container type.
     *
     * Deliberately does not follow `@odata.nextLink`: eagerly walking every page turns
     * opening the panel into an unbounded number of Graph calls. The link comes back on the
     * page so the host — never the webview — decides whether the next page is ever fetched.
     */
    public async list(containerTypeId: string): Promise<GraphPage<StorageItem>> {
        const response: RawCollectionResponse<FileStorageContainer> = await this._client
            .api(BASE_PATH)
            .version('v1.0')
            .filter(`containerTypeId eq ${containerTypeId}`)
            .select(CONTAINER_SELECT)
            .expand('drive($select=quota)')
            .top(DEFAULT_PAGE_SIZE)
            .get();
        return mapCollectionPage(response, containerToStorageItem);
    }

    /** Fetch one further page of active containers from a server-provided link. */
    public async listNextPage(nextLink: string): Promise<GraphPage<StorageItem>> {
        const response: RawCollectionResponse<FileStorageContainer> =
            await this._client.api(nextLink).get();
        return mapCollectionPage(response, containerToStorageItem);
    }

    /** Get a single container by ID. */
    public async get(containerId: string): Promise<StorageItem | null> {
        try {
            const c: FileStorageContainer = await this._client
                .api(`${BASE_PATH}/${containerId}`)
                .version('v1.0')
                .select(CONTAINER_SELECT)
                .expand('drive($select=quota)')
                .get();
            return containerToStorageItem(c);
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((error as any)?.statusCode === 404) { return null; }
            throw error;
        }
    }

    /** Create a new container. */
    public async create(containerTypeId: string, displayName: string, description?: string): Promise<StorageItem> {
        const body: Record<string, string> = { displayName, containerTypeId };
        if (description) { body.description = description; }
        const c: FileStorageContainer = await this._client
            .api(BASE_PATH)
            .version('v1.0')
            .post(body);
        return containerToStorageItem(c);
    }

    /** Activate an inactive container without requiring a content upload. */
    public async activate(containerId: string): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}/activate`)
            .version('v1.0')
            .post({});
    }

    /** Rename a container. */
    public async rename(containerId: string, displayName: string): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}`)
            .version('v1.0')
            .patch({ displayName });
    }

    /** Update a container's description. */
    public async updateDescription(containerId: string, description: string): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}`)
            .version('v1.0')
            .patch({ description });
    }

    /** Soft-delete (recycle) a container. */
    public async delete(containerId: string): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}`)
            .version('v1.0')
            .delete();
    }

    /** List the **first page** of soft-deleted containers for a container type. */
    public async listDeleted(containerTypeId: string): Promise<GraphPage<StorageItem>> {
        const response: RawCollectionResponse<FileStorageContainer> = await this._client
            .api(DELETED_PATH)
            .version('v1.0')
            .filter(`containerTypeId eq ${containerTypeId}`)
            .top(DEFAULT_PAGE_SIZE)
            .get();
        return mapCollectionPage(response, deletedContainerToStorageItem);
    }

    /** Fetch one further page of soft-deleted containers from a server-provided link. */
    public async listDeletedNextPage(nextLink: string): Promise<GraphPage<StorageItem>> {
        const response: RawCollectionResponse<FileStorageContainer> =
            await this._client.api(nextLink).get();
        return mapCollectionPage(response, deletedContainerToStorageItem);
    }

    /** Restore a soft-deleted container. */
    public async restore(containerId: string): Promise<void> {
        await this._client
            .api(`${DELETED_PATH}/${containerId}/restore`)
            .version('v1.0')
            .post({});
    }

    /** Permanently delete a soft-deleted container. */
    public async permanentlyDelete(containerId: string): Promise<void> {
        await this._client
            .api(`${DELETED_PATH}/${containerId}`)
            .version('v1.0')
            .delete();
    }

    /** Get retention label / version settings for a container. */
    public async getSettings(containerId: string): Promise<FileStorageContainerSettings> {
        const result = await this._client
            .api(`${BASE_PATH}/${containerId}`)
            .select('settings')
            .get();
        return (result.settings ?? {}) as FileStorageContainerSettings;
    }

    /** Update retention / versioning settings for a container. */
    public async updateSettings(
        containerId: string,
        settings: Partial<FileStorageContainerSettings>
    ): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}`)
            .patch({ settings });
    }

    // ── Custom properties ─────────────────────────────────────────────────────

    /** Get all custom properties for a container. */
    public async getCustomProperties(containerId: string): Promise<ContainerCustomProperties> {
        const result = await this._client
            .api(`${BASE_PATH}/${containerId}/customProperties`)
            .get();
        // The API returns the properties directly as an object (not wrapped in .value).
        // Strip OData metadata keys that start with '@'.
        const out: ContainerCustomProperties = {};
        const source = (result ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(source)) {
            if (key.charAt(0) !== '@') {
                out[key] = source[key] as FileStorageContainerCustomPropertyValue;
            }
        }
        return out;
    }

    /** Set or update a single custom property. */
    public async setCustomProperty(
        containerId: string,
        key: string,
        value: string,
        isSearchable: boolean
    ): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}/customProperties`)
            .patch({ [key]: { value, isSearchable } });
    }

    /** Delete a custom property by patching its value to null. */
    public async deleteCustomProperty(containerId: string, key: string): Promise<void> {
        await this._client
            .api(`${BASE_PATH}/${containerId}/customProperties`)
            .patch({ [key]: null });
    }
}
