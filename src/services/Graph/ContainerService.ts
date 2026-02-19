/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import {
    Container,
    ContainerCreate,
    ContainerUpdate,
    DeletedContainer,
    containerSchema,
    containerCreateSchema,
    containerUpdateSchema,
    deletedContainerSchema
} from '../../models/schemas';

/**
 * Service for managing File Storage Containers via Microsoft Graph API
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainer?view=graph-rest-beta
 */
export class ContainerService {
    private static readonly API_VERSION = 'beta';
    private static readonly BASE_PATH = '/storage/fileStorage/containers';
    private static readonly DELETED_PATH = '/storage/fileStorage/deletedContainers';

    constructor(private _client: Graph.Client) {}

    /**
     * List all containers for a given container type
     * GET /storage/fileStorage/containers?$filter=containerTypeId eq {containerTypeId}
     */
    async list(containerTypeId: string, options?: {
        select?: string[];
        expand?: string[];
        top?: number;
        skip?: number;
    }): Promise<Container[]> {
        try {
            let request = this._client
                .api(ContainerService.BASE_PATH)
                .version(ContainerService.API_VERSION)
                .filter(`containerTypeId eq ${containerTypeId}`);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }
            if (options?.expand) {
                request = request.expand(options.expand.join(','));
            }
            if (options?.top) {
                request = request.top(options.top);
            }
            if (options?.skip) {
                request = request.skip(options.skip);
            }

            const response = await request.get();

            const containers = response.value.map((c: any) => containerSchema.parse(c));
            return containers;
        } catch (error: any) {
            console.error('[ContainerService.list] Error listing containers:', error);
            throw new Error(`Failed to list containers: ${error.message || error}`);
        }
    }

    /**
     * Get a specific container by ID
     * GET /storage/fileStorage/containers/{id}
     */
    async get(id: string, options?: {
        select?: string[];
        expand?: string[];
    }): Promise<Container | null> {
        try {
            let request = this._client
                .api(`${ContainerService.BASE_PATH}/${id}`)
                .version(ContainerService.API_VERSION);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }
            if (options?.expand) {
                request = request.expand(options.expand.join(','));
            }

            const response = await request.get();
            return containerSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'itemNotFound' || error.statusCode === 404) {
                console.log(`[ContainerService.get] Container not found: ${id}`);
                return null;
            }
            console.error(`[ContainerService.get] Error getting container ${id}:`, error);
            throw new Error(`Failed to get container ${id}: ${error.message || error}`);
        }
    }

    /**
     * Create a new container
     * POST /storage/fileStorage/containers
     */
    async create(container: ContainerCreate): Promise<Container> {
        try {
            const validatedData = containerCreateSchema.parse(container);

            console.log('[ContainerService.create] Creating container:', validatedData.displayName);

            const response = await this._client
                .api(ContainerService.BASE_PATH)
                .version(ContainerService.API_VERSION)
                .post(validatedData);

            console.log('[ContainerService.create] Container created successfully:', response.id);
            return containerSchema.parse(response);
        } catch (error: any) {
            console.error('[ContainerService.create] Error creating container:', error);
            throw new Error(`Failed to create container: ${error.message || error}`);
        }
    }

    /**
     * Update an existing container
     * PATCH /storage/fileStorage/containers/{id}
     */
    async update(id: string, updates: ContainerUpdate): Promise<Container> {
        try {
            const validatedUpdates = containerUpdateSchema.parse(updates);

            console.log(`[ContainerService.update] Updating container ${id}:`, Object.keys(validatedUpdates));

            const response = await this._client
                .api(`${ContainerService.BASE_PATH}/${id}`)
                .version(ContainerService.API_VERSION)
                .patch(validatedUpdates);

            console.log(`[ContainerService.update] Container ${id} updated successfully`);
            return containerSchema.parse(response);
        } catch (error: any) {
            console.error(`[ContainerService.update] Error updating container ${id}:`, error);
            throw new Error(`Failed to update container ${id}: ${error.message || error}`);
        }
    }

    /**
     * Recycle a container (soft delete)
     * DELETE /storage/fileStorage/containers/{id}
     */
    async recycle(id: string): Promise<void> {
        try {
            console.log(`[ContainerService.recycle] Recycling container ${id}`);

            await this._client
                .api(`${ContainerService.BASE_PATH}/${id}`)
                .version(ContainerService.API_VERSION)
                .delete();

            console.log(`[ContainerService.recycle] Container ${id} recycled successfully`);
        } catch (error: any) {
            console.error(`[ContainerService.recycle] Error recycling container ${id}:`, error);
            throw new Error(`Failed to recycle container ${id}: ${error.message || error}`);
        }
    }

    /**
     * List recycled (deleted) containers for a given container type
     * GET /storage/fileStorage/deletedContainers?$filter=containerTypeId eq {containerTypeId}
     */
    async listRecycled(containerTypeId: string): Promise<DeletedContainer[]> {
        try {
            const response = await this._client
                .api(ContainerService.DELETED_PATH)
                .version(ContainerService.API_VERSION)
                .filter(`containerTypeId eq ${containerTypeId}`)
                .get();

            const containers = response.value.map((c: any) => deletedContainerSchema.parse(c));
            return containers;
        } catch (error: any) {
            console.error('[ContainerService.listRecycled] Error listing recycled containers:', error);
            throw new Error(`Failed to list recycled containers: ${error.message || error}`);
        }
    }

    /**
     * Restore a recycled container
     * POST /storage/fileStorage/deletedContainers/{id}/restore
     */
    async restore(id: string): Promise<Container> {
        try {
            console.log(`[ContainerService.restore] Restoring container ${id}`);

            const response = await this._client
                .api(`${ContainerService.DELETED_PATH}/${id}/restore`)
                .version(ContainerService.API_VERSION)
                .post({});

            console.log(`[ContainerService.restore] Container ${id} restored successfully`);
            return containerSchema.parse(response);
        } catch (error: any) {
            console.error(`[ContainerService.restore] Error restoring container ${id}:`, error);
            throw new Error(`Failed to restore container ${id}: ${error.message || error}`);
        }
    }

    /**
     * Permanently delete a recycled container
     * DELETE /storage/fileStorage/deletedContainers/{id}
     */
    async delete(id: string): Promise<void> {
        try {
            console.log(`[ContainerService.delete] Permanently deleting container ${id}`);

            await this._client
                .api(`${ContainerService.DELETED_PATH}/${id}`)
                .version(ContainerService.API_VERSION)
                .delete();

            console.log(`[ContainerService.delete] Container ${id} permanently deleted`);
        } catch (error: any) {
            console.error(`[ContainerService.delete] Error deleting container ${id}:`, error);
            throw new Error(`Failed to delete container ${id}: ${error.message || error}`);
        }
    }
}
