/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSCodeAuthProvider, VSCodeAuthConfig } from './VSCodeAuthProvider';

/**
 * Factory for creating authentication providers for specific applications.
 * These providers use dynamic client IDs (from applications created via GraphProvider)
 * and are scoped for file storage container access.
 */
export class AppAuthProviderFactory {
    private static readonly APP_SCOPES = [
        'https://graph.microsoft.com/FileStorageContainer.Selected'
    ];

    private static readonly _instances = new Map<string, VSCodeAuthProvider>();

    /**
     * Get or create an authentication provider for a specific application
     * @param clientId The client ID of the application
     * @param tenantId Optional tenant ID to scope the authentication
     */
    public static getProvider(clientId: string, tenantId?: string): VSCodeAuthProvider {
        const key = `${clientId}:${tenantId || 'common'}`;
        
        if (!AppAuthProviderFactory._instances.has(key)) {
            const config: VSCodeAuthConfig = {
                clientId,
                scopes: AppAuthProviderFactory.APP_SCOPES,
                tenantId
            };
            
            const provider = new VSCodeAuthProvider(config);
            AppAuthProviderFactory._instances.set(key, provider);
        }

        return AppAuthProviderFactory._instances.get(key)!;
    }

    /**
     * Remove a cached authentication provider
     * @param clientId The client ID of the application
     * @param tenantId Optional tenant ID
     */
    public static removeProvider(clientId: string, tenantId?: string): void {
        const key = `${clientId}:${tenantId || 'common'}`;
        AppAuthProviderFactory._instances.delete(key);
    }

    /**
     * Clear all cached authentication providers
     */
    public static clearAll(): void {
        AppAuthProviderFactory._instances.clear();
    }

    /**
     * Get all active provider keys
     */
    public static getActiveProviders(): string[] {
        return Array.from(AppAuthProviderFactory._instances.keys());
    }
}