/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ARMAuthProvider } from '../services/Auth';
import ARMProvider from '../services/ARMProvider';
import { 
    ArmSubscription, 
    ArmResourceGroup, 
    ArmAccount,
    ArmAccountCreate,
    armAccountCreateSchema 
} from '../models/schemas';

/**
 * Examples of using the updated ARMProvider with Zod schemas
 */
export class ARMSchemaExamples {
    
    /**
     * Example: Using ARMProvider with type-safe responses
     */
    public static async getSubscriptionsExample(): Promise<void> {
        const armAuth = ARMAuthProvider.getInstance();
        const armProvider = new ARMProvider(armAuth);
        
        try {
            // Type-safe subscription retrieval with schema validation
            const subscriptions: ArmSubscription[] = await armProvider.getSubscriptions();
            
            subscriptions.forEach(sub => {
                // IntelliSense knows the exact structure thanks to Zod schema
                console.log(`Subscription: ${sub.displayName} (${sub.subscriptionId})`);
                console.log(`Tenant: ${sub.tenantId}`);
                console.log(`State: ${sub.state}`);
                console.log(`Spending Limit: ${sub.subscriptionPolicies.spendingLimit}`);
            });
        } catch (error) {
            // Zod validation errors provide detailed information about data structure issues
            console.error('Failed to get subscriptions:', error);
        }
    }
    
    /**
     * Example: Creating ARM account with schema validation
     */
    public static async createAccountExample(): Promise<void> {
        const armAuth = ARMAuthProvider.getInstance();
        const armProvider = new ARMProvider(armAuth);
        
        try {
            // Type-safe account creation
            const newAccount: ArmAccount = await armProvider.createArmAccount(
                'subscription-id',
                'resource-group-name',
                'East US',
                'container-type-id'
            );
            
            // Strongly typed response
            console.log(`Created account: ${newAccount.name}`);
            console.log(`Location: ${newAccount.location}`);
            console.log(`Friendly Name: ${newAccount.properties.friendlyName}`);
            console.log(`Identity Type: ${newAccount.properties.identityType}`);
            console.log(`Provisioning State: ${newAccount.properties.provisioningState}`);
        } catch (error) {
            console.error('Failed to create ARM account:', error);
        }
    }
    
    /**
     * Example: Validating external data against ARM schemas
     */
    public static validateExternalData(): void {
        const armProvider = new ARMProvider(ARMAuthProvider.getInstance());
        
        // Example external data that might come from API or user input
        const externalAccountData = {
            id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Syntex/accounts/account',
            name: 'test-account',
            type: 'Microsoft.Syntex/accounts',
            location: 'East US',
            properties: {
                friendlyName: 'Test Container Type',
                identityId: 'ct-12345',
                identityType: 'ContainerType',
                provisioningState: 'Succeeded',
                feature: 'RaaS',
                scope: 'Global',
                service: 'SPO'
            },
            systemData: {
                createdBy: 'user@company.com',
                createdByType: 'User',
                createdAt: '2025-09-20T00:00:00Z',
                lastModifiedAt: '2025-09-20T00:00:00Z',
                lastModifiedBy: 'user@company.com',
                lastModifiedByType: 'User'
            }
        };
        
        try {
            // Validate and get strongly typed object
            const validatedAccount: ArmAccount = armProvider.validateAccount(externalAccountData);
            console.log('Valid ARM account data:', validatedAccount.properties.friendlyName);
        } catch (error) {
            console.error('Invalid ARM account data:', error);
        }
    }
    
    /**
     * Example: Creating account creation payload with validation
     */
    public static createAccountPayload(containerTypeId: string, region: string): ArmAccountCreate {
        const accountCreate: ArmAccountCreate = {
            location: region,
            properties: {
                friendlyName: `CT_${containerTypeId}`,
                service: 'SPO',
                identityType: 'ContainerType',
                identityId: containerTypeId,
                feature: 'RaaS',
                scope: 'Global'
            }
        };
        
        // Validate the payload before sending
        const validated = armAccountCreateSchema.parse(accountCreate);
        return validated;
    }
    
    /**
     * Example: Working with resource groups
     */
    public static async getResourceGroupsExample(subscriptionId: string): Promise<void> {
        const armAuth = ARMAuthProvider.getInstance();
        const armProvider = new ARMProvider(armAuth);
        
        try {
            const resourceGroups: ArmResourceGroup[] = await armProvider.getSubscriptionResourceGroups(subscriptionId);
            
            resourceGroups.forEach(rg => {
                console.log(`Resource Group: ${rg.name}`);
                console.log(`Location: ${rg.location}`);
                console.log(`Provisioning State: ${rg.properties.provisioningState}`);
                
                // Tags are properly typed as Record<string, string> | undefined
                if (rg.tags) {
                    console.log('Tags:', Object.entries(rg.tags));
                }
            });
        } catch (error) {
            console.error('Failed to get resource groups:', error);
        }
    }
}