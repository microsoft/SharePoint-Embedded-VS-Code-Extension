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
    containerTypeSettingsSchema
} from './shared';

/**
 * v1.0 fileStorageContainerType schema
 * Based on Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertype
 */
export const containerTypeSchema = baseResourceSchema.extend({
    id: z.string(),
    name: z.string(),
    owningAppId: guidSchema,
    billingClassification: billingClassificationSchema,
    billingStatus: billingStatusSchema,
    createdDateTime: dateTimeSchema.optional(),
    expirationDateTime: dateTimeSchema.nullable().optional(),
    settings: containerTypeSettingsSchema.optional()
});

/**
 * Schema for creating a new containerType
 * Excludes read-only fields like id, createdDateTime, etag
 */
export const containerTypeCreateSchema = containerTypeSchema.omit({
    id: true,
    createdDateTime: true,
    expirationDateTime: true,
    etag: true,
    ['@odata.type']: true
}).extend({
    // Override billing classification to be optional with default
    billingClassification: billingClassificationSchema.default('standard').optional(),
    // Graph computes the real status from the Syntex account link; callers
    // shouldn't need to send it.
    billingStatus: billingStatusSchema.optional()
});

/**
 * Schema for updating an existing containerType
 * Makes most fields optional except for read-only ones which are omitted
 */
export const containerTypeUpdateSchema = containerTypeSchema.omit({
    id: true,
    createdDateTime: true,
    expirationDateTime: true,
    etag: true,
    ['@odata.type']: true
}).partial();

/**
 * Schema for containerType responses from API calls
 * Includes all possible fields that might be returned
 */
export const containerTypeResponseSchema = containerTypeSchema;

// Validate the beta response envelope without changing the existing raw permissions view.
export const containerTypePermissionsResponseSchema = z.object({ value: z.array(z.unknown()) });

export const containerTypeOwnerPermissionsSchema = z.array(z.object({
    id: z.string().min(1),
    roles: z.array(z.string().min(1)).min(1),
    grantedToV2: z.object({
        user: z.object({ id: z.string().min(1) })
    })
}));

// Export inferred types
export type ContainerType = z.infer<typeof containerTypeSchema>;
export type ContainerTypeCreate = z.infer<typeof containerTypeCreateSchema>;
export type ContainerTypeUpdate = z.infer<typeof containerTypeUpdateSchema>;
export type ContainerTypeResponse = z.infer<typeof containerTypeResponseSchema>;
export type ContainerTypeOwnerPermission = z.infer<typeof containerTypeOwnerPermissionsSchema>[number];