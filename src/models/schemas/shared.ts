/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

/**
 * Billing classification for file storage containers
 */
export const billingClassificationSchema = z.enum([
    'standard',
    'trial',
    'directToCustomer',
    'unknownFutureValue'
]);

/**
 * Billing status for file storage containers
 */
export const billingStatusSchema = z.enum([
    'invalid',
    'valid',
    'unknownFutureValue'
]);

/**
 * File storage container type app permissions
 */
export const containerTypeAppPermissionSchema = z.enum([
    'none',
    'readContent',
    'writeContent',
    'manageContent',
    'create',
    'delete',
    'read',
    'write',
    'enumeratePermissions',
    'addPermissions',
    'updatePermissions',
    'deletePermissions',
    'deleteOwnPermission',
    'managePermissions',
    'full',
    'unknownFutureValue'
]);

/**
 * Base settings schema for file storage container types
 */
export const containerTypeSettingsSchema = z.object({
    urlTemplate: z.string().nullable().optional(),
    isDiscoverabilityEnabled: z.boolean().nullable().optional()
});

/**
 * Registration settings schema for file storage container type registrations
 */
export const containerTypeRegistrationSettingsSchema = z.object({
    urlTemplate: z.string().nullable().optional(),
    isDiscoverabilityEnabled: z.boolean().nullable().optional()
});

/**
 * Common base schema properties
 */
export const baseResourceSchema = z.object({
    ['@odata.type']: z.string().optional(),
    etag: z.string().optional()
});

/**
 * ISO 8601 datetime string schema
 */
export const dateTimeSchema = z.string().datetime();

/**
 * GUID schema
 */
export const guidSchema = z.string().uuid();

// Export inferred types
export type BillingClassification = z.infer<typeof billingClassificationSchema>;
export type BillingStatus = z.infer<typeof billingStatusSchema>;
export type ContainerTypeAppPermission = z.infer<typeof containerTypeAppPermissionSchema>;
export type ContainerTypeSettings = z.infer<typeof containerTypeSettingsSchema>;
export type ContainerTypeRegistrationSettings = z.infer<typeof containerTypeRegistrationSettingsSchema>;