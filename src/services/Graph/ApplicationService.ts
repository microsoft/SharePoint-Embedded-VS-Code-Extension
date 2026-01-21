/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import {
    Application,
    ApplicationCreate,
    ApplicationUpdate,
    applicationSchema,
    applicationCreateSchema,
    applicationUpdateSchema,
    PasswordCredential,
    KeyCredential,
    AddPasswordCredentialRequest,
    RemovePasswordCredentialRequest,
    AddKeyCredentialRequest,
    RemoveKeyCredentialRequest,
    addPasswordCredentialRequestSchema,
    removePasswordCredentialRequestSchema,
    addKeyCredentialRequestSchema,
    removeKeyCredentialRequestSchema,
    passwordCredentialSchema,
    keyCredentialSchema
} from '../../models/schemas';

/**
 * Service for managing Applications via Microsoft Graph API
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/application?view=graph-rest-1.0
 */
export class ApplicationService {
    private static readonly API_VERSION = 'v1.0';
    private static readonly BASE_PATH = '/applications';

    constructor(private _client: Graph.Client) {}

    /**
     * List all applications for the current tenant
     * GET /applications
     */
    async list(options?: {
        filter?: string;
        select?: string[];
        orderBy?: string;
        search?: string;
        top?: number;
        skip?: number;
        count?: boolean;
    }): Promise<{ applications: Application[]; count?: number }> {
        try {
            let request = this._client
                .api(ApplicationService.BASE_PATH)
                .version(ApplicationService.API_VERSION);

            // Add ConsistencyLevel header for advanced queries
            if (options?.search || options?.count || options?.orderBy) {
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
            if (options?.search) {
                request = request.search(options.search);
            }
            if (options?.top) {
                request = request.top(options.top);
            }
            if (options?.skip) {
                request = request.skip(options.skip);
            }
            if (options?.count) {
                request = request.count(true);
            }

            const response = await request.get();

            // Validate and parse each application
            const applications = response.value.map((app: any) => {
                return applicationSchema.parse(app);
            });

            const result: { applications: Application[]; count?: number } = { applications };
            if (options?.count && response['@odata.count'] !== undefined) {
                result.count = response['@odata.count'];
            }

            return result;
        } catch (error: any) {
            console.error('[ApplicationService.list] Error listing applications:', error);
            throw new Error(`Failed to list applications: ${error.message || error}`);
        }
    }

    /**
     * Get a specific application by ID or appId
     * GET /applications/{id}
     * GET /applications(appId='{appId}')
     */
    async get(idOrAppId: string, options?: {
        select?: string[];
        useAppId?: boolean;
    }): Promise<Application | null> {
        try {
            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}`;

            let request = this._client
                .api(path)
                .version(ApplicationService.API_VERSION);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }

            const response = await request.get();
            return applicationSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'Request_ResourceNotFound' || error.code === 'NotFound' || error.statusCode === 404) {
                console.log(`[ApplicationService.get] Application not found: ${idOrAppId} (useAppId: ${options?.useAppId})`);
                return null;
            }
            console.error(`[ApplicationService.get] Error getting application ${idOrAppId}:`, error);
            throw new Error(`Failed to get application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Create a new application
     * POST /applications
     */
    async create(application: ApplicationCreate): Promise<Application> {
        try {
            // Validate input data
            const validatedData = applicationCreateSchema.parse(application);

            console.log('[ApplicationService.create] Creating application:', validatedData.displayName);

            const response = await this._client
                .api(ApplicationService.BASE_PATH)
                .version(ApplicationService.API_VERSION)
                .post(validatedData);

            console.log('[ApplicationService.create] Application created successfully:', response.appId);
            return applicationSchema.parse(response);
        } catch (error: any) {
            console.error('[ApplicationService.create] Error creating application:', error);
            throw new Error(`Failed to create application: ${error.message || error}`);
        }
    }

    /**
     * Update an existing application
     * PATCH /applications/{id}
     * PATCH /applications(appId='{appId}')
     */
    async update(
        idOrAppId: string,
        updates: ApplicationUpdate,
        options?: { useAppId?: boolean }
    ): Promise<void> {
        try {
            // Validate input data
            const validatedUpdates = applicationUpdateSchema.parse(updates);

            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}`;

            console.log(`[ApplicationService.update] Updating application ${idOrAppId}:`, Object.keys(validatedUpdates));

            await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .patch(validatedUpdates);

            console.log(`[ApplicationService.update] Application ${idOrAppId} updated successfully`);
        } catch (error: any) {
            console.error(`[ApplicationService.update] Error updating application ${idOrAppId}:`, error);
            throw new Error(`Failed to update application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Create or update an application using upsert
     * PATCH /applications(uniqueName='{uniqueName}')
     */
    async upsert(uniqueName: string, application: ApplicationCreate): Promise<Application | null> {
        // Validate input data
        const validatedData = applicationCreateSchema.parse(application);

        try {
            const response = await this._client
                .api(`${ApplicationService.BASE_PATH}(uniqueName='${uniqueName}')`)
                .version(ApplicationService.API_VERSION)
                .header('Prefer', 'create-if-missing')
                .patch(validatedData);

            // If the response has a body, it's a new application (201 Created)
            if (response) {
                return applicationSchema.parse(response);
            }
            
            // If no response body, it was an update (204 No Content)
            return null;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Delete an application
     * DELETE /applications/{id}
     * DELETE /applications(appId='{appId}')
     */
    async delete(idOrAppId: string, options?: { useAppId?: boolean }): Promise<void> {
        try {
            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}`;

            console.log(`[ApplicationService.delete] Deleting application ${idOrAppId}`);

            await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .delete();

            console.log(`[ApplicationService.delete] Application ${idOrAppId} deleted successfully`);
        } catch (error: any) {
            console.error(`[ApplicationService.delete] Error deleting application ${idOrAppId}:`, error);
            throw new Error(`Failed to delete application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Search applications by display name or other properties
     * GET /applications?$search="displayName:{searchTerm}"
     */
    async search(searchTerm: string, options?: {
        select?: string[];
        top?: number;
        skip?: number;
        count?: boolean;
    }): Promise<{ applications: Application[]; count?: number }> {
        try {
            // Validate search term is not empty
            if (!searchTerm || searchTerm.trim() === '') {
                throw new Error('Search term cannot be empty');
            }

            console.log(`[ApplicationService.search] Searching for applications: "${searchTerm}"`);

            let request = this._client
                .api(ApplicationService.BASE_PATH)
                .version(ApplicationService.API_VERSION)
                .header('ConsistencyLevel', 'eventual')
                .search(`"displayName:${searchTerm.trim()}"`);

            if (options?.select) {
                request = request.select(options.select.join(','));
            }
            if (options?.top) {
                request = request.top(options.top);
            }
            if (options?.skip) {
                request = request.skip(options.skip);
            }
            if (options?.count) {
                request = request.count(true);
            }

            const response = await request.get();

            // Validate and parse each application
            const applications = response.value.map((app: any) => {
                return applicationSchema.parse(app);
            });

            console.log(`[ApplicationService.search] Found ${applications.length} applications`);

            const result: { applications: Application[]; count?: number } = { applications };
            if (options?.count && response['@odata.count'] !== undefined) {
                result.count = response['@odata.count'];
            }

            return result;
        } catch (error: any) {
            console.error(`[ApplicationService.search] Error searching applications:`, error);
            throw new Error(`Failed to search applications: ${error.message || error}`);
        }
    }

    /**
     * Get applications with less than specified number of owners
     * GET /applications?$filter=owners/$count eq 0 or owners/$count eq 1
     */
    async getWithFewOwners(maxOwners: number = 1, options?: {
        select?: string[];
        top?: number;
        skip?: number;
        count?: boolean;
    }): Promise<{ applications: Application[]; count?: number }> {
        // Build filter for applications with 0 to maxOwners owners
        const filterConditions = [];
        for (let i = 0; i <= maxOwners; i++) {
            filterConditions.push(`owners/$count eq ${i}`);
        }
        const filter = filterConditions.join(' or ');

        let request = this._client
            .api(ApplicationService.BASE_PATH)
            .version(ApplicationService.API_VERSION)
            .header('ConsistencyLevel', 'eventual')
            .filter(filter);

        if (options?.select) {
            request = request.select(options.select.join(','));
        }
        if (options?.top) {
            request = request.top(options.top);
        }
        if (options?.skip) {
            request = request.skip(options.skip);
        }
        if (options?.count) {
            request = request.count(true);
        }

        const response = await request.get();
        
        // Validate and parse each application
        const applications = response.value.map((app: any) => {
            return applicationSchema.parse(app);
        });

        const result: { applications: Application[]; count?: number } = { applications };
        if (options?.count && response['@odata.count'] !== undefined) {
            result.count = response['@odata.count'];
        }

        return result;
    }

    /**
     * Get applications with specific identifier URI scheme
     * GET /applications?$filter=identifierUris/any(x:startswith(x,'api://'))
     */
    async getByIdentifierUriScheme(scheme: string, options?: {
        select?: string[];
        top?: number;
        skip?: number;
        count?: boolean;
    }): Promise<{ applications: Application[]; count?: number }> {
        const filter = `identifierUris/any(x:startswith(x,'${scheme}'))`;

        let request = this._client
            .api(ApplicationService.BASE_PATH)
            .version(ApplicationService.API_VERSION)
            .header('ConsistencyLevel', 'eventual')
            .filter(filter);

        if (options?.select) {
            request = request.select(options.select.join(','));
        }
        if (options?.top) {
            request = request.top(options.top);
        }
        if (options?.skip) {
            request = request.skip(options.skip);
        }
        if (options?.count) {
            request = request.count(true);
        }

        const response = await request.get();
        
        // Validate and parse each application
        const applications = response.value.map((app: any) => {
            return applicationSchema.parse(app);
        });

        const result: { applications: Application[]; count?: number } = { applications };
        if (options?.count && response['@odata.count'] !== undefined) {
            result.count = response['@odata.count'];
        }

        return result;
    }

    /**
     * Get applications by sign-in audience
     * GET /applications?$filter=signInAudience eq '{audience}'
     */
    async getBySignInAudience(audience: string, options?: {
        select?: string[];
        top?: number;
        skip?: number;
        count?: boolean;
    }): Promise<{ applications: Application[]; count?: number }> {
        let request = this._client
            .api(ApplicationService.BASE_PATH)
            .version(ApplicationService.API_VERSION)
            .filter(`signInAudience eq '${audience}'`);

        if (options?.select) {
            request = request.select(options.select.join(','));
        }
        if (options?.top) {
            request = request.top(options.top);
        }
        if (options?.skip) {
            request = request.skip(options.skip);
        }
        if (options?.count) {
            request = request.count(true);
        }

        const response = await request.get();
        
        // Validate and parse each application
        const applications = response.value.map((app: any) => {
            return applicationSchema.parse(app);
        });

        const result: { applications: Application[]; count?: number } = { applications };
        if (options?.count && response['@odata.count'] !== undefined) {
            result.count = response['@odata.count'];
        }

        return result;
    }

    // === Credential Management Methods ===

    /**
     * Add a password credential to an application
     * POST /applications/{id}/addPassword
     * POST /applications(appId='{appId}')/addPassword
     */
    async addPassword(
        idOrAppId: string,
        passwordCredential?: AddPasswordCredentialRequest,
        options?: { useAppId?: boolean }
    ): Promise<PasswordCredential> {
        try {
            // Validate input data if provided
            const validatedData = passwordCredential
                ? { passwordCredential: addPasswordCredentialRequestSchema.parse(passwordCredential) }
                : {};

            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')/addPassword`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}/addPassword`;

            console.log(`[ApplicationService.addPassword] Adding password to application ${idOrAppId}`);

            const response = await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .post(validatedData);

            console.log(`[ApplicationService.addPassword] Password added successfully to ${idOrAppId}`);
            return passwordCredentialSchema.parse(response);
        } catch (error: any) {
            console.error(`[ApplicationService.addPassword] Error adding password to ${idOrAppId}:`, error);
            throw new Error(`Failed to add password to application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Remove a password credential from an application
     * POST /applications/{id}/removePassword
     * POST /applications(appId='{appId}')/removePassword
     */
    async removePassword(
        idOrAppId: string,
        keyId: string,
        options?: { useAppId?: boolean }
    ): Promise<void> {
        try {
            // Validate input data
            const validatedData = removePasswordCredentialRequestSchema.parse({ keyId });

            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')/removePassword`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}/removePassword`;

            console.log(`[ApplicationService.removePassword] Removing password ${keyId} from application ${idOrAppId}`);

            await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .post(validatedData);

            console.log(`[ApplicationService.removePassword] Password ${keyId} removed successfully from ${idOrAppId}`);
        } catch (error: any) {
            console.error(`[ApplicationService.removePassword] Error removing password from ${idOrAppId}:`, error);
            throw new Error(`Failed to remove password from application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Add a key credential to an application
     * POST /applications/{id}/addKey
     * POST /applications(appId='{appId}')/addKey
     */
    async addKey(
        idOrAppId: string,
        keyCredentialRequest: AddKeyCredentialRequest,
        options?: { useAppId?: boolean }
    ): Promise<KeyCredential> {
        try {
            // Validate input data
            const validatedData = addKeyCredentialRequestSchema.parse(keyCredentialRequest);

            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')/addKey`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}/addKey`;

            console.log(`[ApplicationService.addKey] Adding key credential to application ${idOrAppId}`);

            const response = await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .post(validatedData);

            console.log(`[ApplicationService.addKey] Key credential added successfully to ${idOrAppId}`);
            return keyCredentialSchema.parse(response);
        } catch (error: any) {
            console.error(`[ApplicationService.addKey] Error adding key credential to ${idOrAppId}:`, error);
            throw new Error(`Failed to add key credential to application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Remove a key credential from an application
     * POST /applications/{id}/removeKey
     * POST /applications(appId='{appId}')/removeKey
     */
    async removeKey(
        idOrAppId: string,
        keyId: string,
        proof: string,
        options?: { useAppId?: boolean }
    ): Promise<void> {
        try {
            // Validate input data
            const validatedData = removeKeyCredentialRequestSchema.parse({ keyId, proof });

            const path = options?.useAppId
                ? `${ApplicationService.BASE_PATH}(appId='${idOrAppId}')/removeKey`
                : `${ApplicationService.BASE_PATH}/${idOrAppId}/removeKey`;

            console.log(`[ApplicationService.removeKey] Removing key credential ${keyId} from application ${idOrAppId}`);

            await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .post(validatedData);

            console.log(`[ApplicationService.removeKey] Key credential ${keyId} removed successfully from ${idOrAppId}`);
        } catch (error: any) {
            console.error(`[ApplicationService.removeKey] Error removing key credential from ${idOrAppId}:`, error);
            throw new Error(`Failed to remove key credential from application ${idOrAppId}: ${error.message || error}`);
        }
    }
}