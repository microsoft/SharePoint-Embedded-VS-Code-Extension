/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import {
    ContainerTypeRegistration,
    ContainerTypeRegistrationCreate,
    ContainerTypeRegistrationUpdate,
    containerTypeRegistrationSchema,
    containerTypeRegistrationCreateSchema,
    containerTypeRegistrationUpdateSchema
} from '../../models/schemas';
import { Logger } from '../../utils/Logger';

/**
 * Service for managing File Storage Container Type Registrations via Microsoft Graph API
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertyperegistration?view=graph-rest-beta
 */
export class ContainerTypeRegistrationService {
    private static readonly API_VERSION = 'v1.0';
    private static readonly BASE_PATH = '/storage/fileStorage/containerTypeRegistrations';

    constructor(private _client: Graph.Client) {}

    /**
     * List all container type registrations for the current tenant
     * GET /storage/fileStorage/containerTypeRegistrations
     */
    async list(options?: {
        filter?: string;
        select?: string[];
        orderBy?: string;
        top?: number;
        skip?: number;
    }): Promise<ContainerTypeRegistration[]> {
        try {
            let request = this._client
                .api(ContainerTypeRegistrationService.BASE_PATH)
                .version(ContainerTypeRegistrationService.API_VERSION);

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

            // Validate and parse each registration
            const registrations = (response?.value || []).map((reg: any) => {
                return containerTypeRegistrationSchema.parse(reg);
            });

            return registrations;
        } catch (error: any) {
            console.error('[ContainerTypeRegistrationService.list] Error listing registrations:', error);
            throw new Error(`Failed to list container type registrations: ${error.message || error}`);
        }
    }

    /**
     * Get a specific container type registration by container type ID
     * GET /storage/fileStorage/containerTypeRegistrations/{id}
     */
    async get(containerTypeId: string, options?: { select?: string[] }): Promise<ContainerTypeRegistration | null> {
        try {
            let request = this._client
                .api(`${ContainerTypeRegistrationService.BASE_PATH}/${containerTypeId}`)
                .version(ContainerTypeRegistrationService.API_VERSION);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }

            const response = await request.get();
            return containerTypeRegistrationSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'NotFound' || error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Create or replace a container type registration (register a container type)
     * PUT /storage/fileStorage/containerTypeRegistrations/{containerTypeId}
     * Note: Uses PUT method as specified in the API documentation
     */
    async register(
        containerTypeId: string,
        registration: ContainerTypeRegistrationCreate
    ): Promise<ContainerTypeRegistration> {
        try {
            // Validate input data
            const validatedData = containerTypeRegistrationCreateSchema.parse(registration);
            Logger.log(`[ContainerTypeRegistrationService.register] Registering container type ${containerTypeId}`);

            const response = await this._client
                .api(`${ContainerTypeRegistrationService.BASE_PATH}/${containerTypeId}`)
                .version(ContainerTypeRegistrationService.API_VERSION)
                .put(validatedData);

            Logger.log(`[ContainerTypeRegistrationService.register] Container type ${containerTypeId} registered successfully`);
            return containerTypeRegistrationSchema.parse(response);
        } catch (error: any) {
            console.error(`[ContainerTypeRegistrationService.register] Error registering container type ${containerTypeId}:`, error);
            throw new Error(`Failed to register container type ${containerTypeId}: ${error.message || error}`);
        }
    }

    /**
     * Update an existing container type registration
     * PATCH /storage/fileStorage/containerTypeRegistrations/{containerTypeId}
     */
    async update(
        containerTypeId: string,
        updates: ContainerTypeRegistrationUpdate
    ): Promise<ContainerTypeRegistration> {
        try {
            // Validate input data
            const validatedUpdates = containerTypeRegistrationUpdateSchema.parse(updates);

            Logger.log(`[ContainerTypeRegistrationService.update] Updating registration ${containerTypeId}:`, Object.keys(validatedUpdates));

            const response = await this._client
                .api(`${ContainerTypeRegistrationService.BASE_PATH}/${containerTypeId}`)
                .version(ContainerTypeRegistrationService.API_VERSION)
                .patch(validatedUpdates);

            Logger.log(`[ContainerTypeRegistrationService.update] Registration ${containerTypeId} updated successfully`);
            return containerTypeRegistrationSchema.parse(response);
        } catch (error: any) {
            console.error(`[ContainerTypeRegistrationService.update] Error updating registration ${containerTypeId}:`, error);
            throw new Error(`Failed to update registration ${containerTypeId}: ${error.message || error}`);
        }
    }

    /**
     * Delete a container type registration (unregister a container type)
     * DELETE /storage/fileStorage/containerTypeRegistrations/{containerTypeId}
     */
    async unregister(containerTypeId: string): Promise<void> {
        try {
            Logger.log(`[ContainerTypeRegistrationService.unregister] Unregistering container type ${containerTypeId}`);
            await this._client
                .api(`${ContainerTypeRegistrationService.BASE_PATH}/${containerTypeId}`)
                .version(ContainerTypeRegistrationService.API_VERSION)
                .delete();
            Logger.log(`[ContainerTypeRegistrationService.unregister] Container type ${containerTypeId} unregistered successfully`);
        } catch (error: any) {
            console.error(`[ContainerTypeRegistrationService.unregister] Error unregistering container type ${containerTypeId}:`, error);
            throw new Error(`Failed to unregister container type ${containerTypeId}: ${error.message || error}`);
        }
    }

    /**
     * Get registrations by owning application ID
     */
    async getByOwningApp(owningAppId: string): Promise<ContainerTypeRegistration[]> {
        const filter = `owningAppId eq '${owningAppId}'`;
        return this.list({ filter });
    }

    /**
     * Get trial registrations that are about to expire
     */
    async getExpiringTrials(daysFromNow: number = 7): Promise<ContainerTypeRegistration[]> {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysFromNow);
        const isoDate = futureDate.toISOString();
        
        const filter = `billingClassification eq 'trial' and expirationDateTime le '${isoDate}'`;
        return this.list({ filter, orderBy: 'expirationDateTime asc' });
    }

    /**
     * Get registrations with invalid billing status
     */
    async getInvalidBilling(): Promise<ContainerTypeRegistration[]> {
        const filter = `billingStatus eq 'invalid'`;
        return this.list({ filter });
    }

    /**
     * Check if a container type is registered in the current tenant
     */
    async isRegistered(containerTypeId: string): Promise<boolean> {
        const registration = await this.get(containerTypeId);
        return registration !== null;
    }
}