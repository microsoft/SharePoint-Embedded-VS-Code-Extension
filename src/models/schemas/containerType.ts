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
 * Full fileStorageContainerType schema
 * Based on Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertype
 */
export const containerTypeSchema = baseResourceSchema.extend({
    id: z.string(),
    name: z.string(),
    owningAppId: guidSchema,
    billingClassification: billingClassificationSchema.default('standard'),
    billingStatus: billingStatusSchema,
    createdDateTime: dateTimeSchema.optional(),
    expirationDateTime: dateTimeSchema.nullable().optional(),
    settings: containerTypeSettingsSchema
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
    billingClassification: billingClassificationSchema.default('standard').optional()
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

// Export inferred types
export type ContainerType = z.infer<typeof containerTypeSchema>;
export type ContainerTypeCreate = z.infer<typeof containerTypeCreateSchema>;
export type ContainerTypeUpdate = z.infer<typeof containerTypeUpdateSchema>;
export type ContainerTypeResponse = z.infer<typeof containerTypeResponseSchema>;