/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import {
    baseResourceSchema,
    billingClassificationSchema,
    billingStatusSchema,
    dateTimeSchema,
    guidSchema,
    containerTypeRegistrationSettingsSchema
} from './shared';

/**
 * Full fileStorageContainerTypeRegistration schema
 * Based on Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertyperegistration
 */
export const containerTypeRegistrationSchema = baseResourceSchema.extend({
    id: z.string(),
    name: z.string(),
    owningAppId: guidSchema,
    billingClassification: billingClassificationSchema,
    billingStatus: billingStatusSchema,
    expirationDateTime: dateTimeSchema.nullable().optional(),
    registeredDateTime: dateTimeSchema.optional(),
    settings: containerTypeRegistrationSettingsSchema
});

/**
 * Schema for creating a new containerTypeRegistration
 * According to Graph API docs, the PUT request body should only contain applicationPermissionGrants (optional)
 * The container type ID in the URL identifies which container type to register
 * See: https://learn.microsoft.com/en-us/graph/api/filestorage-post-containertyperegistrations
 */
export const containerTypeRegistrationCreateSchema = z.object({
    // Optional: Application permission grants to set during registration
    applicationPermissionGrants: z.array(z.object({
        appId: guidSchema,
        delegatedPermissions: z.array(z.string()).optional(),
        applicationPermissions: z.array(z.string()).optional()
    })).optional()
});

/**
 * Schema for updating an existing containerTypeRegistration
 * Makes most fields optional except for read-only ones which are omitted
 */
export const containerTypeRegistrationUpdateSchema = containerTypeRegistrationSchema.omit({
    id: true,
    registeredDateTime: true,
    etag: true,
    ['@odata.type']: true
}).partial();

/**
 * Schema for containerTypeRegistration responses from API calls
 * Includes all possible fields that might be returned
 */
export const containerTypeRegistrationResponseSchema = containerTypeRegistrationSchema;

// Export inferred types
export type ContainerTypeRegistration = z.infer<typeof containerTypeRegistrationSchema>;
export type ContainerTypeRegistrationCreate = z.infer<typeof containerTypeRegistrationCreateSchema>;
export type ContainerTypeRegistrationUpdate = z.infer<typeof containerTypeRegistrationUpdateSchema>;
export type ContainerTypeRegistrationResponse = z.infer<typeof containerTypeRegistrationResponseSchema>;