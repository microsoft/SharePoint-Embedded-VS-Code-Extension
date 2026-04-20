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
    ServicePrincipal,
    servicePrincipalSchema
} from '../../models/schemas';
import { Logger } from '../../utils/Logger';
import { clientId } from '../../client';

/** Well-known 1P app IDs whose service principals won't exist in customer tenants. */
const wellKnownApps: ReadonlyMap<string, string> = new Map([
    [clientId, 'SharePoint Embedded VS Code Extension'],
    ['de8bc8b5-d9f9-48b1-a8ad-b748da725064', 'Graph Explorer'],
    ['e8e1b0bf-140f-4b8b-8e94-fbe8937fad04', 'Power Platform Connector'],
]);

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
                Logger.log(`[ApplicationService.get] Application not found: ${idOrAppId} (useAppId: ${options?.useAppId})`);
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

            Logger.log('[ApplicationService.create] Creating application:', validatedData.displayName);

            const response = await this._client
                .api(ApplicationService.BASE_PATH)
                .version(ApplicationService.API_VERSION)
                .post(validatedData);

            Logger.log('[ApplicationService.create] Application created successfully:', response.appId);
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

            Logger.log(`[ApplicationService.update] Updating application ${idOrAppId}:`, Object.keys(validatedUpdates));

            await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .patch(validatedUpdates);

            Logger.log(`[ApplicationService.update] Application ${idOrAppId} updated successfully`);
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

            Logger.log(`[ApplicationService.delete] Deleting application ${idOrAppId}`);

            await this._client
                .api(path)
                .version(ApplicationService.API_VERSION)
                .delete();

            Logger.log(`[ApplicationService.delete] Application ${idOrAppId} deleted successfully`);
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

            Logger.log(`[ApplicationService.search] Searching for applications: "${searchTerm}"`);

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

            Logger.log(`[ApplicationService.search] Found ${applications.length} applications`);

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

    // === Permission Management Methods ===

    /**
     * Check and ensure application has required Microsoft Graph permissions for container type operations
     * Adds all necessary scopes for a container type owning application
     * Returns true if permissions were already configured, false if they were added
     *
     * @param idOrAppId - Application ID or appId (client ID)
     * @param options - Optional parameters (useAppId)
     * @returns Object indicating whether permissions were added and if consent is needed
     */
    async ensureContainerTypePermissions(
        idOrAppId: string,
        options?: { useAppId?: boolean }
    ): Promise<{ permissionsAdded: boolean; requiresConsent: boolean }> {
        try {
            Logger.log(`[ApplicationService.ensureContainerTypePermissions] Checking permissions for ${idOrAppId}`);

            // Get current application configuration
            const app = await this.get(idOrAppId, options);
            if (!app) {
                throw new Error(`Application ${idOrAppId} not found`);
            }

            // Microsoft Graph resource
            const GRAPH_RESOURCE_APP_ID = "00000003-0000-0000-c000-000000000000";

            // Required scopes for container type owning applications (delegated permissions)
            const REQUIRED_SCOPES = [
                { id: "c319a7df-930e-44c0-a43b-7e5e9c7f4f24", name: "FileStorageContainerTypeReg.Manage.All" },
                { id: "085ca537-6565-41c2-aca7-db852babc212", name: "FileStorageContainer.Selected" },
                { id: "8e6ec84c-5fcd-4cc7-ac8a-2296efc0ed9b", name: "FileStorageContainerType.Manage.All" },
                { id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d", name: "User.Read" },
            ];

            const existingRequiredResourceAccess = app.requiredResourceAccess || [];
            const graphResourceAccess = existingRequiredResourceAccess.find(
                (rra: any) => rra.resourceAppId === GRAPH_RESOURCE_APP_ID
            );

            const existingScopes = graphResourceAccess?.resourceAccess || [];
            const existingScopeIds = new Set(
                existingScopes
                    .filter((ra: any) => ra.type === "Scope")
                    .map((ra: any) => ra.id)
            );

            // Check which scopes are missing
            const missingScopes = REQUIRED_SCOPES.filter(
                scope => !existingScopeIds.has(scope.id)
            );

            if (missingScopes.length === 0) {
                Logger.log(`[ApplicationService.ensureContainerTypePermissions] App ${idOrAppId} already has all required permissions`);
                return { permissionsAdded: false, requiresConsent: false };
            }

            Logger.log(`[ApplicationService.ensureContainerTypePermissions] Adding missing scopes:`, missingScopes.map(s => s.name));

            // Add the missing scopes
            const newResourceAccess = [
                ...existingScopes,
                ...missingScopes.map(scope => ({ id: scope.id, type: "Scope" }))
            ];

            let updatedRequiredResourceAccess;
            if (graphResourceAccess) {
                // Update existing Graph resource access
                graphResourceAccess.resourceAccess = newResourceAccess;
                updatedRequiredResourceAccess = existingRequiredResourceAccess;
            } else {
                // Add new Graph resource access entry
                updatedRequiredResourceAccess = [
                    ...existingRequiredResourceAccess,
                    {
                        resourceAppId: GRAPH_RESOURCE_APP_ID,
                        resourceAccess: newResourceAccess
                    }
                ];
            }

            // Update the application
            await this.update(app.id!, {
                requiredResourceAccess: updatedRequiredResourceAccess
            });

            Logger.log(`[ApplicationService.ensureContainerTypePermissions] Added ${missingScopes.length} missing scope(s) to ${idOrAppId}`);

            return { permissionsAdded: true, requiresConsent: true };

        } catch (error: any) {
            console.error(`[ApplicationService.ensureContainerTypePermissions] Error ensuring permissions for ${idOrAppId}:`, error);
            throw new Error(`Failed to ensure container type permissions for application ${idOrAppId}: ${error.message || error}`);
        }
    }

    /**
     * Ensure an owning application has all required Graph permissions:
     *   - FileStorageContainer.Selected Role  (app-only containers access)
     *   - FileStorageContainer.Selected Scope (delegated containers access)
     *
     * These complement the scopes that ensureContainerTypePermissions adds at
     * registration time (User.Read etc.).
     *
     * @returns true if any permissions were added, false if all already existed
     */
    async ensureOwningAppPermissions(
        idOrAppId: string,
        options?: { useAppId?: boolean }
    ): Promise<boolean> {
        try {
            Logger.log(`[ApplicationService.ensureOwningAppPermissions] Checking for ${idOrAppId}`);

            const app = await this.get(idOrAppId, options);
            if (!app) {
                throw new Error(`Application ${idOrAppId} not found`);
            }

            const GRAPH_RESOURCE_APP_ID = '00000003-0000-0000-c000-000000000000';

            const REQUIRED_PERMISSIONS = [
                { id: '40dc41bc-0f7e-42ff-89bd-d9516947e474', type: 'Role' },  // FSC.Selected Role
                { id: '085ca537-6565-41c2-aca7-db852babc212', type: 'Scope' }, // FSC.Selected Scope
            ];

            const existingRRA = [...(app.requiredResourceAccess ?? [])];
            let graphResource = existingRRA.find((r: any) => r.resourceAppId === GRAPH_RESOURCE_APP_ID);
            if (!graphResource) {
                graphResource = { resourceAppId: GRAPH_RESOURCE_APP_ID, resourceAccess: [] };
                existingRRA.push(graphResource);
            }

            const existingAccess = graphResource.resourceAccess ?? [];
            const missing = REQUIRED_PERMISSIONS.filter(
                perm => !existingAccess.some((ra: any) => ra.id === perm.id && ra.type === perm.type)
            );

            if (missing.length === 0) {
                Logger.log(`[ApplicationService.ensureOwningAppPermissions] All permissions already present`);
                return false;
            }

            graphResource.resourceAccess = [...existingAccess, ...missing];
            await this.update(app.id!, { requiredResourceAccess: existingRRA });
            Logger.log(`[ApplicationService.ensureOwningAppPermissions] Added ${missing.length} permission(s) to ${idOrAppId}`);
            return true;

        } catch (error: any) {
            console.error(`[ApplicationService.ensureOwningAppPermissions] Error:`, error);
            throw new Error(`Failed to add owning app permissions: ${error.message || error}`);
        }
    }

    /**
     * Ensure an application has the FileStorageContainer.Selected application permission (Role).
     * This is required for sample apps that use client credentials flow to call Graph.
     *
     * @returns true if the permission was added, false if it already existed
     */
    async ensureFileStorageContainerSelectedRole(
        idOrAppId: string,
        options?: { useAppId?: boolean }
    ): Promise<boolean> {
        try {
            Logger.log(`[ApplicationService.ensureFileStorageContainerSelectedRole] Checking for ${idOrAppId}`);

            const app = await this.get(idOrAppId, options);
            if (!app) {
                throw new Error(`Application ${idOrAppId} not found`);
            }

            const GRAPH_RESOURCE_APP_ID = '00000003-0000-0000-c000-000000000000';
            const FSC_SELECTED_ROLE_ID = '40dc41bc-0f7e-42ff-89bd-d9516947e474';

            const existingRRA = app.requiredResourceAccess ?? [];
            const graphResource = existingRRA.find((r: any) => r.resourceAppId === GRAPH_RESOURCE_APP_ID);
            const existingAccess = graphResource?.resourceAccess ?? [];

            const hasRole = existingAccess.some(
                (ra: any) => ra.id === FSC_SELECTED_ROLE_ID && ra.type === 'Role'
            );

            if (hasRole) {
                Logger.log(`[ApplicationService.ensureFileStorageContainerSelectedRole] Already present`);
                return false;
            }

            const newAccess = [...existingAccess, { id: FSC_SELECTED_ROLE_ID, type: 'Role' }];

            let updatedRRA;
            if (graphResource) {
                graphResource.resourceAccess = newAccess;
                updatedRRA = existingRRA;
            } else {
                updatedRRA = [
                    ...existingRRA,
                    { resourceAppId: GRAPH_RESOURCE_APP_ID, resourceAccess: newAccess }
                ];
            }

            await this.update(app.id!, { requiredResourceAccess: updatedRRA });
            Logger.log(`[ApplicationService.ensureFileStorageContainerSelectedRole] Added to ${idOrAppId}`);
            return true;

        } catch (error: any) {
            console.error(`[ApplicationService.ensureFileStorageContainerSelectedRole] Error:`, error);
            throw new Error(`Failed to add FileStorageContainer.Selected role: ${error.message || error}`);
        }
    }

    /**
     * Ensure an application exposes the Container.Manage API scope.
     * Also sets the identifier URI (api://{appId}) and requestedAccessTokenVersion=2 if needed.
     *
     * @returns true if the scope was added, false if it already existed
     */
    async ensureContainerManageScope(
        idOrAppId: string,
        options?: { useAppId?: boolean }
    ): Promise<boolean> {
        try {
            Logger.log(`[ApplicationService.ensureContainerManageScope] Checking API scope for ${idOrAppId}`);

            const app = await this.get(idOrAppId, options);
            if (!app) {
                throw new Error(`Application ${idOrAppId} not found`);
            }

            const existingScopes = app.api?.oauth2PermissionScopes ?? [];
            const hasScope = existingScopes.some((s: any) => s.value === 'Container.Manage');

            if (hasScope) {
                Logger.log(`[ApplicationService.ensureContainerManageScope] Container.Manage scope already exists`);
                return false;
            }

            // Build the new scope
            const { v4: uuidv4 } = await import('uuid');
            const newScope = {
                id: uuidv4(),
                isEnabled: true,
                type: 'User',
                value: 'Container.Manage',
                userConsentDisplayName: 'Create and manage storage containers',
                userConsentDescription: 'Create and manage storage containers',
                adminConsentDisplayName: 'Create and manage storage containers',
                adminConsentDescription: 'Create and manage storage containers'
            };

            const updates: any = {
                api: {
                    oauth2PermissionScopes: [...existingScopes, newScope],
                    requestedAccessTokenVersion: 2
                }
            };

            // Ensure identifier URI is set
            const appId = app.appId!;
            const expectedUri = `api://${appId}`;
            if (!app.identifierUris?.includes(expectedUri)) {
                updates.identifierUris = [...(app.identifierUris ?? []), expectedUri];
            }

            await this.update(app.id!, updates);
            Logger.log(`[ApplicationService.ensureContainerManageScope] Container.Manage scope added to ${idOrAppId}`);
            return true;

        } catch (error: any) {
            console.error(`[ApplicationService.ensureContainerManageScope] Error:`, error);
            throw new Error(`Failed to add Container.Manage scope: ${error.message || error}`);
        }
    }

    // === Service Principal Management ===

    /**
     * Get a service principal by appId
     * GET /servicePrincipals(appId='{appId}')
     *
     * @param appId - The appId (client ID) of the application
     * @returns The ServicePrincipal or null if not found
     */
    async getServicePrincipal(appId: string): Promise<ServicePrincipal> {
        // Short-circuit for well-known 1P apps that won't have a service principal in the tenant
        const knownName = wellKnownApps.get(appId);
        if (knownName) {
            Logger.log(`[ApplicationService.getServicePrincipal] Resolved well-known app ${appId} → ${knownName}`);
            return servicePrincipalSchema.parse({ id: appId, appId, displayName: knownName });
        }

        try {
            Logger.log(`[ApplicationService.getServicePrincipal] Getting service principal for appId: ${appId}`);

            const response = await this._client
                .api(`/servicePrincipals(appId='${appId}')`)
                .version(ApplicationService.API_VERSION)
                .get();

            Logger.log(`[ApplicationService.getServicePrincipal] Found service principal: ${response.id}`);
            return servicePrincipalSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'Request_ResourceNotFound' || error.statusCode === 404) {
                Logger.log(`[ApplicationService.getServicePrincipal] Service principal not found for appId: ${appId}`);
                throw new Error(`Service principal not found for application ${appId}`);
            }
            console.error(`[ApplicationService.getServicePrincipal] Error getting service principal for ${appId}:`, error);
            throw new Error(`Failed to get service principal for application ${appId}: ${error.message || error}`);
        }
    }

}