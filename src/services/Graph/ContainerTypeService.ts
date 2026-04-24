/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import {
    ContainerType,
    ContainerTypeCreate,
    ContainerTypeUpdate,
    containerTypeSchema,
    containerTypeCreateSchema,
    containerTypeUpdateSchema
} from '../../models/schemas';
import { Logger } from '../../utils/Logger';

/**
 * Service for managing File Storage Container Types via Microsoft Graph API
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertype?view=graph-rest-beta
 */
export class ContainerTypeService {
    private static readonly API_VERSION = 'v1.0';
    private static readonly BASE_PATH = '/storage/fileStorage/containerTypes';

    constructor(private _client: Graph.Client) {}

    /**
     * List all container types for the current tenant
     * GET /storage/fileStorage/containerTypes
     */
    async list(options?: {
        filter?: string;
        select?: string[];
        orderBy?: string;
        top?: number;
        skip?: number;
    }): Promise<ContainerType[]> {
        try {
            let request = this._client
                .api(ContainerTypeService.BASE_PATH)
                .version(ContainerTypeService.API_VERSION);

            // Add ConsistencyLevel header for advanced queries
            if (options?.orderBy) {
                request = request.header('ConsistencyLevel', 'eventual');
            }

            if (options?.filter) {
                request = request.filter(options.filter);
            }
            if (options?.select) {
                request = request.select(options.select.join(','));
            }
            if (options?.orderBy) {
                request = request.orderby(options.orderBy);
            }
            if (options?.top) {
                request = request.top(options.top);
            }
            if (options?.skip) {
                request = request.skip(options.skip);
            }

            const response = await request.get();

            // Validate and parse each container type
            const containerTypes = (response?.value || []).map((ct: any) => {
                return containerTypeSchema.parse(ct);
            });

            return containerTypes;
        } catch (error: any) {
            console.error('[ContainerTypeService.list] Error listing container types:', error);
            throw new Error(`Failed to list container types: ${error.message || error}`);
        }
    }

    /**
     * Get a specific container type by ID
     * GET /storage/fileStorage/containerTypes/{id}
     */
    async get(id: string, options?: {
        select?: string[];
        noCache?: boolean;
    }): Promise<ContainerType | null> {
        try {
            let request = this._client
                .api(`${ContainerTypeService.BASE_PATH}/${id}`)
                .version(ContainerTypeService.API_VERSION);

            // Add cache-control header to prevent stale data
            if (options?.noCache) {
                request = request.header('Cache-Control', 'no-cache');
            }

            if (options?.select) {
                request = request.select(options.select.join(','));
            }

            Logger.log(`[ContainerTypeService.get] Fetching container type ${id}`);
            const response = await request.get();
            Logger.log(`[ContainerTypeService.get] Response:`, JSON.stringify(response, null, 2));
            return containerTypeSchema.parse(response);
        } catch (error: any) {
            console.error(`[ContainerTypeService.get] Error fetching ${id}:`, error);
            if (error.code === 'NotFound' || error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Create a new container type.
     * POST /v1.0/storage/fileStorage/containerTypes
     *
     * The caller controls `billingClassification` via the payload — the
     * service no longer hardcodes 'trial'. `permissions` is not a navigation
     * property on fileStorageContainerType, so $expand=permissions is not
     * supported; use `patchOwners` separately to set permissions.
     */
    async create(containerType: ContainerTypeCreate): Promise<ContainerType> {
        try {
            const validatedData = containerTypeCreateSchema.parse(containerType);
            Logger.log('[ContainerTypeService.create] Creating container type:', validatedData.name);

            const response = await this._client
                .api(ContainerTypeService.BASE_PATH)
                .version(ContainerTypeService.API_VERSION)
                .post(validatedData);

            Logger.log('[ContainerTypeService.create] Container type created successfully');
            return containerTypeSchema.parse(response);
        } catch (error: any) {
            console.error('[ContainerTypeService.create] Error creating container type:', error);
            throw new Error(`Failed to create container type: ${error.message || error}`);
        }
    }

    /**
     * Add an owner permission for a single user on a container type.
     *
     * POST /beta/storage/fileStorage/containerTypes/{id}/permissions
     *
     * Permissions live only in the beta Graph surface (v1.0 exposes no
     * relationship for them), so this method pins `beta` locally while the
     * rest of the service stays on v1.0. Each owner is a separate POST;
     * there is no bulk-replace endpoint. Re-POSTing an existing user is
     * idempotent. A container type accepts at most 3 permissions.
     */
    async addOwner(id: string, userId: string): Promise<void> {
        try {
            const requestBody = {
                roles: ['owner'],
                grantedToV2: { user: { id: userId } }
            };

            Logger.log(`[ContainerTypeService.addOwner] Adding owner ${userId} to container type ${id}`);

            await this._client
                .api(`${ContainerTypeService.BASE_PATH}/${id}/permissions`)
                .version('beta')
                .post(requestBody);

            Logger.log(`[ContainerTypeService.addOwner] Owner ${userId} added to container type ${id}`);
        } catch (error: any) {
            console.error(`[ContainerTypeService.addOwner] Error adding owner ${userId} to ${id}:`, error);
            throw new Error(`Failed to add owner to container type: ${error.message || error}`);
        }
    }

    /**
     * Update an existing container type
     * PATCH /storage/fileStorage/containerTypes/{id}
     * Note: ETag is required for optimistic concurrency control
     */
    async update(id: string, updates: ContainerTypeUpdate, etag: string): Promise<ContainerType> {
        try {
            // Validate input data
            const validatedUpdates = containerTypeUpdateSchema.parse(updates);

            // Include etag in the request body as required by the API
            const requestBody = {
                ...validatedUpdates,
                etag
            };

            Logger.log(`[ContainerTypeService.update] Updating container type ${id}:`, Object.keys(validatedUpdates));

            const response = await this._client
                .api(`${ContainerTypeService.BASE_PATH}/${id}`)
                .version(ContainerTypeService.API_VERSION)
                .patch(requestBody);

            Logger.log(`[ContainerTypeService.update] Container type ${id} updated successfully`);
            return containerTypeSchema.parse(response);
        } catch (error: any) {
            console.error(`[ContainerTypeService.update] Error updating container type ${id}:`, error);
            throw new Error(`Failed to update container type ${id}: ${error.message || error}`);
        }
    }

    /**
     * Delete a container type
     * DELETE /storage/fileStorage/containerTypes/{id}
     */
    async delete(id: string): Promise<void> {
        try {
            Logger.log(`[ContainerTypeService.delete] Deleting container type ${id}`);
            await this._client
                .api(`${ContainerTypeService.BASE_PATH}/${id}`)
                .version(ContainerTypeService.API_VERSION)
                .delete();
            Logger.log(`[ContainerTypeService.delete] Container type ${id} deleted successfully`);
        } catch (error: any) {
            console.error(`[ContainerTypeService.delete] Error deleting container type ${id}:`, error);
            throw new Error(`Failed to delete container type ${id}: ${error.message || error}`);
        }
    }

    /**
     * Search container types by display name or other properties
     * GET /storage/fileStorage/containerTypes?$search="displayName:{searchTerm}"
     */
    async search(searchTerm: string, options?: {
        select?: string[];
        top?: number;
        skip?: number;
    }): Promise<ContainerType[]> {
        try {
            let request = this._client
                .api(ContainerTypeService.BASE_PATH)
                .version(ContainerTypeService.API_VERSION)
                .header('ConsistencyLevel', 'eventual')
                .search(`"displayName:${searchTerm}"`);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }
            if (options?.top) {
                request = request.top(options.top);
            }
            if (options?.skip) {
                request = request.skip(options.skip);
            }

            const response = await request.get();

            // Validate and parse each container type
            const containerTypes = (response?.value || []).map((ct: any) => {
                return containerTypeSchema.parse(ct);
            });

            return containerTypes;
        } catch (error: any) {
            console.error(`[ContainerTypeService.search] Error searching container types for "${searchTerm}":`, error);
            throw new Error(`Failed to search container types: ${error.message || error}`);
        }
    }

    /**
     * Get container types by owning application ID
     * GET /storage/fileStorage/containerTypes?$filter=owningAppId eq '{owningAppId}'
     */
    async getByOwningApp(owningAppId: string, options?: {
        select?: string[];
        orderBy?: string;
        top?: number;
        skip?: number;
    }): Promise<ContainerType[]> {
        const filter = `owningAppId eq '${owningAppId}'`;
        return this.list({ 
            filter, 
            select: options?.select,
            orderBy: options?.orderBy,
            top: options?.top,
            skip: options?.skip
        });
    }

    /**
     * Get trial container types that are about to expire
     * GET /storage/fileStorage/containerTypes?$filter=billingClassification eq 'trial' and expirationDateTime le '{futureDate}'
     */
    async getExpiringTrials(daysFromNow: number = 7, options?: {
        select?: string[];
        top?: number;
        skip?: number;
    }): Promise<ContainerType[]> {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysFromNow);
        const isoDate = futureDate.toISOString();
        
        const filter = `billingClassification eq 'trial' and expirationDateTime le '${isoDate}'`;
        return this.list({ 
            filter, 
            orderBy: 'expirationDateTime asc',
            select: options?.select,
            top: options?.top,
            skip: options?.skip
        });
    }

    /**
     * Get container types by billing classification
     * GET /storage/fileStorage/containerTypes?$filter=billingClassification eq '{classification}'
     */
    async getByBillingClassification(
        classification: 'standard' | 'trial' | 'directToCustomer' | 'unknownFutureValue',
        options?: {
            select?: string[];
            orderBy?: string;
            top?: number;
            skip?: number;
        }
    ): Promise<ContainerType[]> {
        const filter = `billingClassification eq '${classification}'`;
        return this.list({ 
            filter,
            select: options?.select,
            orderBy: options?.orderBy,
            top: options?.top,
            skip: options?.skip
        });
    }

    /**
     * Get container types that are active (not expired)
     * GET /storage/fileStorage/containerTypes?$filter=expirationDateTime gt now() or expirationDateTime eq null
     */
    async getActive(options?: {
        select?: string[];
        orderBy?: string;
        top?: number;
        skip?: number;
    }): Promise<ContainerType[]> {
        const now = new Date().toISOString();
        const filter = `expirationDateTime gt '${now}' or expirationDateTime eq null`;
        return this.list({ 
            filter,
            select: options?.select,
            orderBy: options?.orderBy,
            top: options?.top,
            skip: options?.skip
        });
    }

    /**
     * Get container types that have expired
     * GET /storage/fileStorage/containerTypes?$filter=expirationDateTime lt now()
     */
    async getExpired(options?: {
        select?: string[];
        orderBy?: string;
        top?: number;
        skip?: number;
    }): Promise<ContainerType[]> {
        const now = new Date().toISOString();
        const filter = `expirationDateTime lt '${now}'`;
        return this.list({ 
            filter,
            select: options?.select,
            orderBy: options?.orderBy || 'expirationDateTime desc',
            top: options?.top,
            skip: options?.skip
        });
    }
}