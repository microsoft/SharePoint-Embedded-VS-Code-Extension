/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSCodeAuthProvider, VSCodeAuthConfig } from './VSCodeAuthProvider';
import { clientId } from '../../client';

/**
 * Authentication provider specifically configured for Microsoft Graph operations
 * including container type management, applications, and other Graph resources.
 */
export class GraphAuthProvider extends VSCodeAuthProvider {
    private static readonly GRAPH_SCOPES = [
        'https://graph.microsoft.com/Application.ReadWrite.All',
        'https://graph.microsoft.com/FileStorageContainer.Manage.All',
        'https://graph.microsoft.com/FileStorageContainer.Selected',
        'https://graph.microsoft.com/FileStorageContainerType.Manage.All',
        'https://graph.microsoft.com/FileStorageContainerTypeReg.Manage.All',
        'https://graph.microsoft.com/User.Read'
    ];

    private static _instance: GraphAuthProvider | undefined;
    private static _instanceTenantId: string | undefined;

    constructor(tenantId?: string) {
        const config: VSCodeAuthConfig = {
            clientId,
            scopes: GraphAuthProvider.GRAPH_SCOPES,
            tenantId
        };
        super(config);
    }

    /**
     * Get or create the singleton instance of GraphAuthProvider
     * If tenantId changes, the instance will be recreated
     */
    public static getInstance(tenantId?: string): GraphAuthProvider {
        // If instance exists but tenant changed, reset and recreate
        if (GraphAuthProvider._instance && GraphAuthProvider._instanceTenantId !== tenantId) {
            GraphAuthProvider._instance = undefined;
        }
        
        if (!GraphAuthProvider._instance) {
            GraphAuthProvider._instance = new GraphAuthProvider(tenantId);
            GraphAuthProvider._instanceTenantId = tenantId;
        }
        return GraphAuthProvider._instance;
    }

    /**
     * Reset the singleton instance (useful for testing or tenant changes)
     * Also resets GraphProvider to ensure consistency
     */
    public static resetInstance(): void {
        GraphAuthProvider._instance = undefined;
        GraphAuthProvider._instanceTenantId = undefined;
        
        // Also reset GraphProvider since it depends on GraphAuthProvider
        try {
            const { GraphProvider: graphProvider } = require('../Graph/GraphProvider');
            graphProvider.resetInstance();
        } catch {
            // GraphProvider might not be loaded yet, ignore
        }
    }
}