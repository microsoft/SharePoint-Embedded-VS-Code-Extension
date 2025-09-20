/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test file to verify ARM schemas are properly exported from models/schemas
import { 
    ArmSubscription,
    ArmResourceGroup,
    ArmAccount,
    ArmAccountCreate,
    armSubscriptionSchema,
    armResourceGroupSchema,
    armAccountSchema,
    armAccountCreateSchema 
} from '../models/schemas';

/**
 * Simple test to verify ARM schemas are accessible and working
 */
export function testARMSchemasAccess(): void {
    // Test that types are available
    const testSubscription: ArmSubscription = {
        id: '/subscriptions/test',
        name: 'test-subscription',
        type: 'Microsoft.Subscription',
        authorizationSource: 'RoleBased',
        managedByTenants: [],
        subscriptionId: 'test-sub-id',
        subscriptionPolicies: {
            locationPlacementId: 'test',
            quotaId: 'test',
            spendingLimit: 'Off'
        },
        tenantId: 'test-tenant',
        displayName: 'Test Subscription',
        state: 'Enabled'
    };

    // Test that schemas are available and working
    const validatedSubscription = armSubscriptionSchema.parse(testSubscription);
    
    console.log('ARM schemas are properly accessible from models/schemas');
    console.log('Test subscription:', validatedSubscription.displayName);
}