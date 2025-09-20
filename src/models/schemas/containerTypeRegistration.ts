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
 * Excludes read-only fields like id, registeredDateTime, etag
 */
export const containerTypeRegistrationCreateSchema = containerTypeRegistrationSchema.omit({
    id: true,
    registeredDateTime: true,
    etag: true,
    ['@odata.type']: true
}).extend({
    // Make name optional since it might be derived from the container type
    name: z.string().optional(),
    // Override billing classification to be optional with default
    billingClassification: billingClassificationSchema.default('standard').optional()
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