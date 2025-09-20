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

/**
 * Service for managing File Storage Container Types via Microsoft Graph API
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertype?view=graph-rest-beta
 */
export class ContainerTypeService {
    private static readonly API_VERSION = 'beta';
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
        const containerTypes = response.value.map((ct: any) => {
            return containerTypeSchema.parse(ct);
        });

        return containerTypes;
    }

    /**
     * Get a specific container type by ID
     * GET /storage/fileStorage/containerTypes/{id}
     */
    async get(id: string, options?: { 
        select?: string[];
    }): Promise<ContainerType | null> {
        try {
            let request = this._client
                .api(`${ContainerTypeService.BASE_PATH}/${id}`)
                .version(ContainerTypeService.API_VERSION);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }

            const response = await request.get();
            return containerTypeSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'NotFound' || error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Create a new container type
     * POST /storage/fileStorage/containerTypes
     */
    async create(containerType: ContainerTypeCreate): Promise<ContainerType> {
        // Validate input data
        const validatedData = containerTypeCreateSchema.parse(containerType);

        const response = await this._client
            .api(ContainerTypeService.BASE_PATH)
            .version(ContainerTypeService.API_VERSION)
            .post(validatedData);

        return containerTypeSchema.parse(response);
    }

    /**
     * Update an existing container type
     * PATCH /storage/fileStorage/containerTypes/{id}
     * Note: ETag is required for optimistic concurrency control
     */
    async update(id: string, updates: ContainerTypeUpdate, etag: string): Promise<ContainerType> {
        // Validate input data
        const validatedUpdates = containerTypeUpdateSchema.parse(updates);

        // Include etag in the request body as required by the API
        const requestBody = {
            ...validatedUpdates,
            etag
        };

        const response = await this._client
            .api(`${ContainerTypeService.BASE_PATH}/${id}`)
            .version(ContainerTypeService.API_VERSION)
            .patch(requestBody);

        return containerTypeSchema.parse(response);
    }

    /**
     * Delete a container type
     * DELETE /storage/fileStorage/containerTypes/{id}
     */
    async delete(id: string): Promise<void> {
        await this._client
            .api(`${ContainerTypeService.BASE_PATH}/${id}`)
            .version(ContainerTypeService.API_VERSION)
            .delete();
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
        const containerTypes = response.value.map((ct: any) => {
            return containerTypeSchema.parse(ct);
        });

        return containerTypes;
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