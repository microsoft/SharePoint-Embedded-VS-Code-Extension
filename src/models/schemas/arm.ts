/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

/**
 * Base ARM resource schema with common properties
 */
export const armBaseResourceSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string()
});

/**
 * ARM system data schema for tracking resource creation and modification
 */
export const armSystemDataSchema = z.object({
    createdBy: z.string(),
    createdByType: z.string(),
    createdAt: z.string(),
    lastModifiedAt: z.string(),
    lastModifiedBy: z.string(),
    lastModifiedByType: z.string()
});

/**
 * ARM subscription policy schema
 */
export const armSubscriptionPolicySchema = z.object({
    locationPlacementId: z.string(),
    quotaId: z.string(),
    spendingLimit: z.string(),
    quotaPeriod: z.string().optional(),
    spendingLimitPerSubscription: z.string().optional(),
    spendingLimitPerSubscriptionPeriod: z.string().optional(),
    quotaPeriodType: z.string().optional(),
    spendingLimitPerSubscriptionPeriodType: z.string().optional()
});

/**
 * ARM subscription schema
 */
export const armSubscriptionSchema = armBaseResourceSchema.extend({
    authorizationSource: z.string(),
    managedByTenants: z.array(z.string()),
    subscriptionId: z.string(),
    subscriptionPolicies: armSubscriptionPolicySchema,
    tenantId: z.string(),
    displayName: z.string(),
    state: z.string()
});

/**
 * ARM resource group properties schema
 */
export const armResourceGroupPropertiesSchema = z.object({
    provisioningState: z.string()
});

/**
 * ARM resource group schema
 */
export const armResourceGroupSchema = armBaseResourceSchema.extend({
    location: z.string(),
    managedBy: z.string().optional(),
    properties: armResourceGroupPropertiesSchema,
    tags: z.record(z.string(), z.string()).optional()
});

/**
 * ARM provider registration state
 */
export const armProviderRegistrationStateSchema = z.enum([
    'NotRegistered',
    'Registered', 
    'Registering',
    'Unregistered',
    'Unregistering'
]);

/**
 * ARM Syntex provider schema
 */
export const armSyntexProviderSchema = armBaseResourceSchema.extend({
    namespace: z.string(),
    registrationState: armProviderRegistrationStateSchema,
    authorizations: z.array(z.any()),
    resourceTypes: z.array(z.any()),
    registrationPolicy: z.string()
});

/**
 * ARM Syntex account identity types
 */
export const armAccountIdentityTypeSchema = z.enum([
    'ContainerType',
    'Application',
    'User'
]);

/**
 * ARM Syntex account features
 */
export const armAccountFeatureSchema = z.enum([
    'RaaS',
    'Analytics',
    'Compliance'
]);

/**
 * ARM Syntex account scope
 */
export const armAccountScopeSchema = z.enum([
    'Global',
    'Regional',
    'Tenant'
]);

/**
 * ARM Syntex account service
 */
export const armAccountServiceSchema = z.enum([
    'SPO',
    'OneDrive',
    'Teams'
]);

/**
 * ARM account provisioning state
 */
export const armProvisioningStateSchema = z.enum([
    'Succeeded',
    'Failed',
    'Canceled',
    'Provisioning',
    'Updating',
    'Deleting',
    'Accepted'
]);

/**
 * ARM Syntex account properties schema
 */
export const armAccountPropertiesSchema = z.object({
    friendlyName: z.string(),
    identityId: z.string(),
    identityType: armAccountIdentityTypeSchema,
    provisioningState: armProvisioningStateSchema,
    feature: armAccountFeatureSchema,
    scope: armAccountScopeSchema,
    service: armAccountServiceSchema
});

/**
 * ARM Syntex account schema
 */
export const armAccountSchema = armBaseResourceSchema.extend({
    location: z.string(),
    properties: armAccountPropertiesSchema,
    systemData: armSystemDataSchema
});

/**
 * Schema for creating ARM Syntex account
 */
export const armAccountCreateSchema = z.object({
    location: z.string(),
    properties: armAccountPropertiesSchema.omit({
        provisioningState: true
    })
});

/**
 * ARM API collection response wrapper
 */
export const armCollectionResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
    z.object({
        value: z.array(itemSchema),
        nextLink: z.string().optional()
    });

// Export inferred types
export type ArmSubscription = z.infer<typeof armSubscriptionSchema>;
export type ArmSubscriptionPolicy = z.infer<typeof armSubscriptionPolicySchema>;
export type ArmResourceGroup = z.infer<typeof armResourceGroupSchema>;
export type ArmResourceGroupProperties = z.infer<typeof armResourceGroupPropertiesSchema>;
export type ArmSyntexProvider = z.infer<typeof armSyntexProviderSchema>;
export type ArmAccount = z.infer<typeof armAccountSchema>;
export type ArmAccountProperties = z.infer<typeof armAccountPropertiesSchema>;
export type ArmAccountCreate = z.infer<typeof armAccountCreateSchema>;
export type ArmSystemData = z.infer<typeof armSystemDataSchema>;
export type ArmCollectionResponse<T> = z.infer<ReturnType<typeof armCollectionResponseSchema<z.ZodType<T>>>>;

// Export schema collection responses
export const armSubscriptionsResponseSchema = armCollectionResponseSchema(armSubscriptionSchema);
export const armResourceGroupsResponseSchema = armCollectionResponseSchema(armResourceGroupSchema);
export const armAccountsResponseSchema = armCollectionResponseSchema(armAccountSchema);

export type ArmSubscriptionsResponse = z.infer<typeof armSubscriptionsResponseSchema>;
export type ArmResourceGroupsResponse = z.infer<typeof armResourceGroupsResponseSchema>;
export type ArmAccountsResponse = z.infer<typeof armAccountsResponseSchema>;