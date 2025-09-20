/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import {
    ContainerTypeAppPermissionGrant,
    ContainerTypeAppPermissionGrantCreate,
    ContainerTypeAppPermissionGrantUpdate,
    containerTypeAppPermissionGrantSchema,
    containerTypeAppPermissionGrantCreateSchema,
    containerTypeAppPermissionGrantUpdateSchema,
    PermissionArray,
    permissionArraySchema,
    ContainerTypeAppPermission
} from '../../models/schemas';

/**
 * Service for managing File Storage Container Type App Permission Grants via Microsoft Graph API
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertypeapppermissiongrant?view=graph-rest-beta
 */
export class ContainerTypeAppPermissionGrantService {
    private static readonly API_VERSION = 'beta';
    private static readonly BASE_PATH = '/storage/fileStorage/containerTypeRegistrations';

    constructor(private _client: Graph.Client) {}

    /**
     * List all app permission grants for a container type registration
     * GET /storage/fileStorage/containerTypeRegistrations/{registrationId}/applicationPermissionGrants
     */
    async list(
        registrationId: string,
        options?: {
            filter?: string;
            select?: string[];
            orderBy?: string;
            top?: number;
            skip?: number;
        }
    ): Promise<ContainerTypeAppPermissionGrant[]> {
        let request = this._client
            .api(`${ContainerTypeAppPermissionGrantService.BASE_PATH}/${registrationId}/applicationPermissionGrants`)
            .version(ContainerTypeAppPermissionGrantService.API_VERSION);

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
        
        // Validate and parse each permission grant
        const grants = response.value.map((grant: any) => {
            return containerTypeAppPermissionGrantSchema.parse(grant);
        });

        return grants;
    }

    /**
     * Get a specific app permission grant by app ID
     * GET /storage/fileStorage/containerTypeRegistrations/{registrationId}/applicationPermissionGrants/{appId}
     */
    async get(
        registrationId: string, 
        appId: string, 
        options?: { select?: string[] }
    ): Promise<ContainerTypeAppPermissionGrant | null> {
        try {
            let request = this._client
                .api(`${ContainerTypeAppPermissionGrantService.BASE_PATH}/${registrationId}/applicationPermissionGrants/${appId}`)
                .version(ContainerTypeAppPermissionGrantService.API_VERSION);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }

            const response = await request.get();
            return containerTypeAppPermissionGrantSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'NotFound' || error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Create or replace an app permission grant
     * PUT /storage/fileStorage/containerTypeRegistrations/{registrationId}/applicationPermissionGrants/{appId}
     * Note: Uses PUT method as specified in the API documentation
     */
    async createOrReplace(
        registrationId: string,
        appId: string,
        grant: ContainerTypeAppPermissionGrantCreate
    ): Promise<ContainerTypeAppPermissionGrant> {
        // Validate input data (appId is not included in body per API docs)
        const validatedData = containerTypeAppPermissionGrantCreateSchema.omit({ appId: true }).parse(grant);

        const response = await this._client
            .api(`${ContainerTypeAppPermissionGrantService.BASE_PATH}/${registrationId}/applicationPermissionGrants/${appId}`)
            .version(ContainerTypeAppPermissionGrantService.API_VERSION)
            .put(validatedData);

        return containerTypeAppPermissionGrantSchema.parse(response);
    }

    /**
     * Update an existing app permission grant
     * PATCH /storage/fileStorage/containerTypeRegistrations/{registrationId}/applicationPermissionGrants/{appId}
     */
    async update(
        registrationId: string,
        appId: string,
        updates: ContainerTypeAppPermissionGrantUpdate
    ): Promise<ContainerTypeAppPermissionGrant> {
        // Validate input data (exclude appId from updates)
        const validatedUpdates = containerTypeAppPermissionGrantUpdateSchema.omit({ appId: true }).parse(updates);

        const response = await this._client
            .api(`${ContainerTypeAppPermissionGrantService.BASE_PATH}/${registrationId}/applicationPermissionGrants/${appId}`)
            .version(ContainerTypeAppPermissionGrantService.API_VERSION)
            .patch(validatedUpdates);

        return containerTypeAppPermissionGrantSchema.parse(response);
    }

    /**
     * Delete an app permission grant
     * DELETE /storage/fileStorage/containerTypeRegistrations/{registrationId}/applicationPermissionGrants/{appId}
     */
    async delete(registrationId: string, appId: string): Promise<void> {
        await this._client
            .api(`${ContainerTypeAppPermissionGrantService.BASE_PATH}/${registrationId}/applicationPermissionGrants/${appId}`)
            .version(ContainerTypeAppPermissionGrantService.API_VERSION)
            .delete();
    }

    /**
     * Update only the application permissions for an app
     */
    async updateApplicationPermissions(
        registrationId: string,
        appId: string,
        applicationPermissions: string[]
    ): Promise<ContainerTypeAppPermissionGrant> {
        const updates = { ...permissionArraySchema.parse({ applicationPermissions }), appId };
        return this.update(registrationId, appId, updates);
    }

    /**
     * Update only the delegated permissions for an app
     */
    async updateDelegatedPermissions(
        registrationId: string,
        appId: string,
        delegatedPermissions: string[]
    ): Promise<ContainerTypeAppPermissionGrant> {
        const updates = { ...permissionArraySchema.parse({ delegatedPermissions }), appId };
        return this.update(registrationId, appId, updates);
    }

    /**
     * Grant full permissions to an app (both application and delegated)
     */
    async grantFullPermissions(
        registrationId: string,
        appId: string
    ): Promise<ContainerTypeAppPermissionGrant> {
        const grant: ContainerTypeAppPermissionGrantCreate = {
            appId,
            applicationPermissions: ['full'],
            delegatedPermissions: ['full']
        };
        return this.createOrReplace(registrationId, appId, grant);
    }

    /**
     * Grant read-only permissions to an app
     */
    async grantReadOnlyPermissions(
        registrationId: string,
        appId: string
    ): Promise<ContainerTypeAppPermissionGrant> {
        const grant: ContainerTypeAppPermissionGrantCreate = {
            appId,
            applicationPermissions: ['read', 'readContent'],
            delegatedPermissions: ['read', 'readContent']
        };
        return this.createOrReplace(registrationId, appId, grant);
    }

    /**
     * Check if an app has specific permissions
     */
    async hasPermissions(
        registrationId: string,
        appId: string,
        requiredApplicationPermissions: ContainerTypeAppPermission[] = [],
        requiredDelegatedPermissions: ContainerTypeAppPermission[] = []
    ): Promise<{ hasApplication: boolean; hasDelegated: boolean; grant: ContainerTypeAppPermissionGrant | null }> {
        const grant = await this.get(registrationId, appId);
        
        if (!grant) {
            return { hasApplication: false, hasDelegated: false, grant: null };
        }

        const hasApplication = requiredApplicationPermissions.length === 0 || 
            grant.applicationPermissions.includes('full') ||
            requiredApplicationPermissions.every(perm => grant.applicationPermissions.includes(perm));

        const hasDelegated = requiredDelegatedPermissions.length === 0 ||
            grant.delegatedPermissions.includes('full') ||
            requiredDelegatedPermissions.every(perm => grant.delegatedPermissions.includes(perm));

        return { hasApplication, hasDelegated, grant };
    }
}