/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GraphAuthProvider, ARMAuthProvider, AppAuthProviderFactory } from '../services/Auth';

/**
 * Example usage of the new authentication system
 */
export class AuthUsageExamples {
    
    /**
     * Example: Using GraphAuthProvider for container type management
     */
    public static async useGraphAuth(): Promise<void> {
        // Get the singleton instance for Graph operations
        const graphAuth = GraphAuthProvider.getInstance();
        
        // Sign in for Graph operations (includes all necessary Graph scopes)
        const session = await graphAuth.signIn();
        console.log('Signed in for Graph operations:', session.account.label);
        
        // Get a token for Graph API calls
        const token = await graphAuth.getToken();
        console.log('Graph token acquired');
        
        // Use with Graph SDK (authHandler is automatically configured)
        const authHandler = graphAuth.getAuthHandler();
        // Pass authHandler to Microsoft Graph Client...
    }
    
    /**
     * Example: Using ARMAuthProvider for Azure Resource Manager operations
     */
    public static async useARMAuth(): Promise<void> {
        // Get the singleton instance for ARM operations
        const armAuth = ARMAuthProvider.getInstance();
        
        // Sign in for ARM operations (includes ARM scopes)
        const session = await armAuth.signIn();
        console.log('Signed in for ARM operations:', session.account.label);
        
        // Get a token for ARM API calls
        const token = await armAuth.getToken();
        console.log('ARM token acquired');
    }
    
    /**
     * Example: Using AppAuthProviderFactory for application-specific authentication
     */
    public static async useAppAuth(applicationClientId: string): Promise<void> {
        // Get a provider for a specific application
        const appAuth = AppAuthProviderFactory.getProvider(applicationClientId);
        
        // Sign in with limited scopes (FileStorageContainer.Selected + offline_access)
        const session = await appAuth.signIn();
        console.log('Signed in for app-specific operations:', session.account.label);
        
        // Get a token for file container operations
        const token = await appAuth.getToken();
        console.log('App-specific token acquired');
        
        // When done, you can remove the cached provider
        AppAuthProviderFactory.removeProvider(applicationClientId);
    }
    
    /**
     * Example: Multi-tenant scenario
     */
    public static async useMultiTenantAuth(tenantId: string): Promise<void> {
        // Create tenant-specific providers
        const graphAuth = GraphAuthProvider.getInstance(tenantId);
        const armAuth = ARMAuthProvider.getInstance(tenantId);
        
        // Both will be scoped to the specific tenant
        const graphSession = await graphAuth.signIn();
        const armSession = await armAuth.signIn();
        
        console.log('Multi-tenant auth configured for tenant:', tenantId);
    }
    
    /**
     * Example: Managing multiple application authentications
     */
    public static async manageMultipleApps(): Promise<void> {
        const app1ClientId = 'app1-client-id';
        const app2ClientId = 'app2-client-id';
        const tenantId = 'specific-tenant-id';
        
        // Get providers for different apps
        const app1Auth = AppAuthProviderFactory.getProvider(app1ClientId, tenantId);
        const app2Auth = AppAuthProviderFactory.getProvider(app2ClientId, tenantId);
        
        // Each has its own authentication context
        await app1Auth.signIn();
        await app2Auth.signIn();
        
        console.log('Active app providers:', AppAuthProviderFactory.getActiveProviders());
        
        // Clean up when done
        AppAuthProviderFactory.clearAll();
    }
}