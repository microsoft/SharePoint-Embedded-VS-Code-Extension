/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import {
    baseResourceSchema,
    dateTimeSchema,
    guidSchema
} from './shared';

/**
 * Container status enum
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainer
 */
export const containerStatusSchema = z.enum([
    'inactive',
    'active',
    'unknownFutureValue'
]);

/**
 * Container permission roles
 */
export const containerPermissionRoleSchema = z.enum([
    'reader',
    'writer',
    'manager',
    'owner'
]);

/**
 * User identity schema for permissions
 */
export const userIdentitySchema = z.object({
    displayName: z.string().optional(),
    email: z.string().email().optional(),
    userPrincipalName: z.string()
});

/**
 * Identity set schema for grantedToV2
 */
export const identitySetSchema = z.object({
    user: userIdentitySchema.optional(),
    application: z.object({
        id: z.string().optional(),
        displayName: z.string().optional()
    }).optional(),
    device: z.object({
        id: z.string().optional(),
        displayName: z.string().optional()
    }).optional()
});

/**
 * Container permission schema
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/permission
 */
export const containerPermissionSchema = z.object({
    id: z.string(),
    roles: z.array(containerPermissionRoleSchema),
    grantedToV2: identitySetSchema.optional()
});

/**
 * Custom property value schema
 */
export const customPropertyValueSchema = z.object({
    value: z.string(),
    isSearchable: z.boolean()
});

/**
 * Custom properties schema (dictionary of custom properties)
 */
export const containerCustomPropertiesSchema = z.record(z.string(), customPropertyValueSchema);

/**
 * Column definition schema for container columns
 */
export const containerColumnDefinitionSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    displayName: z.string().optional(),
    enforceUniqueValues: z.boolean().optional(),
    hidden: z.boolean().optional(),
    indexed: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    required: z.boolean().optional()
});

/**
 * Full fileStorageContainer schema
 * Based on Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainer
 */
export const containerSchema = baseResourceSchema.extend({
    id: z.string(),
    displayName: z.string(),
    description: z.string().optional(),
    containerTypeId: guidSchema,
    status: containerStatusSchema.optional(),
    createdDateTime: dateTimeSchema.optional(),
    storageUsedInBytes: z.number().int().nonnegative().optional(),
    itemMajorVersionLimit: z.number().int().min(0).max(50000).optional(),
    isItemVersioningEnabled: z.boolean().optional(),
    viewpoint: z.object({
        effectiveRole: containerPermissionRoleSchema.optional()
    }).optional(),
    customProperties: containerCustomPropertiesSchema.optional(),
    permissions: z.array(containerPermissionSchema).optional(),
    drive: z.object({
        id: z.string()
    }).optional(),
    recycleBin: z.object({
        id: z.string()
    }).optional()
});

/**
 * Schema for creating a new container
 * Based on: https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-post
 * Excludes read-only fields like id, createdDateTime, storageUsedInBytes, etc.
 */
export const containerCreateSchema = z.object({
    displayName: z.string().min(1).max(256),
    description: z.string().max(1024).optional(),
    containerTypeId: guidSchema,
    itemMajorVersionLimit: z.number().int().min(0).max(50000).optional(),
    isItemVersioningEnabled: z.boolean().optional()
});

/**
 * Schema for updating an existing container
 * Based on: https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-update
 * Makes updateable fields optional
 */
export const containerUpdateSchema = z.object({
    displayName: z.string().min(1).max(256).optional(),
    description: z.string().max(1024).optional(),
    itemMajorVersionLimit: z.number().int().min(0).max(50000).optional(),
    isItemVersioningEnabled: z.boolean().optional()
});

/**
 * Schema for container responses from API calls
 * Includes all possible fields that might be returned
 */
export const containerResponseSchema = containerSchema;

/**
 * Schema for container collection response
 */
export const containerCollectionResponseSchema = z.object({
    ['@odata.context']: z.string().optional(),
    ['@odata.nextLink']: z.string().url().optional(),
    value: z.array(containerSchema)
});

/**
 * Schema for deleted/recycled container
 * Based on: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainer (deletedDateTime property)
 */
export const deletedContainerSchema = containerSchema.extend({
    deletedDateTime: dateTimeSchema.optional()
});

/**
 * Schema for container permission creation
 * Based on: https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-post-permissions
 */
export const containerPermissionCreateSchema = z.object({
    roles: z.array(containerPermissionRoleSchema).min(1),
    grantedToV2: identitySetSchema
});

/**
 * Schema for container permission update
 */
export const containerPermissionUpdateSchema = z.object({
    roles: z.array(containerPermissionRoleSchema).min(1)
});

/**
 * Schema for custom property operations
 */
export const containerCustomPropertyCreateSchema = z.object({
    value: z.string(),
    isSearchable: z.boolean().default(false)
});

// Export inferred types
export type ContainerStatus = z.infer<typeof containerStatusSchema>;
export type ContainerPermissionRole = z.infer<typeof containerPermissionRoleSchema>;
export type UserIdentity = z.infer<typeof userIdentitySchema>;
export type IdentitySet = z.infer<typeof identitySetSchema>;
export type ContainerPermission = z.infer<typeof containerPermissionSchema>;
export type CustomPropertyValue = z.infer<typeof customPropertyValueSchema>;
export type ContainerCustomProperties = z.infer<typeof containerCustomPropertiesSchema>;
export type ContainerColumnDefinition = z.infer<typeof containerColumnDefinitionSchema>;
export type Container = z.infer<typeof containerSchema>;
export type ContainerCreate = z.infer<typeof containerCreateSchema>;
export type ContainerUpdate = z.infer<typeof containerUpdateSchema>;
export type ContainerResponse = z.infer<typeof containerResponseSchema>;
export type ContainerCollectionResponse = z.infer<typeof containerCollectionResponseSchema>;
export type DeletedContainer = z.infer<typeof deletedContainerSchema>;
export type ContainerPermissionCreate = z.infer<typeof containerPermissionCreateSchema>;
export type ContainerPermissionUpdate = z.infer<typeof containerPermissionUpdateSchema>;
export type ContainerCustomPropertyCreate = z.infer<typeof containerCustomPropertyCreateSchema>;