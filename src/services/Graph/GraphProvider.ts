/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import { GraphAuthProvider } from '../Auth';
import { ApplicationService } from './ApplicationService';
import { ContainerTypeService } from './ContainerTypeService';
import { ContainerTypeRegistrationService } from './ContainerTypeRegistrationService';
import { ContainerTypeAppPermissionGrantService } from './ContainerTypeAppPermissionGrantService';

/**
 * Singleton provider for Microsoft Graph API operations
 * Handles applications, container types, registrations, and app permission grants
 */
export class GraphProvider {
    private static _instance: GraphProvider | undefined;

    private _client: Graph.Client;
    private _applicationService: ApplicationService;
    private _containerTypeService: ContainerTypeService;
    private _registrationService: ContainerTypeRegistrationService;
    private _appPermissionGrantService: ContainerTypeAppPermissionGrantService;

    private constructor(private _authProvider: GraphAuthProvider) {
        this._client = Graph.Client.init({
            authProvider: _authProvider.getAuthHandler()
        });

        // Initialize services
        this._applicationService = new ApplicationService(this._client);
        this._containerTypeService = new ContainerTypeService(this._client);
        this._registrationService = new ContainerTypeRegistrationService(this._client);
        this._appPermissionGrantService = new ContainerTypeAppPermissionGrantService(this._client);
    }

    /**
     * Get or create the singleton instance of GraphProvider
     * Uses the GraphAuthProvider singleton to ensure consistent authentication
     */
    public static getInstance(): GraphProvider {
        if (!GraphProvider._instance) {
            // Always use the GraphAuthProvider singleton to ensure session consistency
            const authProvider = GraphAuthProvider.getInstance();
            GraphProvider._instance = new GraphProvider(authProvider);
        }
        return GraphProvider._instance;
    }

    /**
     * Reset the singleton instance (useful for testing)
     */
    public static resetInstance(): void {
        GraphProvider._instance = undefined;
    }

    /**
     * Application operations
     */
    public get applications(): ApplicationService {
        return this._applicationService;
    }

    /**
     * Container Type operations
     */
    public get containerTypes(): ContainerTypeService {
        return this._containerTypeService;
    }

    /**
     * Container Type Registration operations
     */
    public get registrations(): ContainerTypeRegistrationService {
        return this._registrationService;
    }

    /**
     * App Permission Grant operations
     */
    public get appPermissionGrants(): ContainerTypeAppPermissionGrantService {
        return this._appPermissionGrantService;
    }

    /**
     * Get the underlying Graph client for advanced operations
     */
    public get client(): Graph.Client {
        return this._client;
    }
}