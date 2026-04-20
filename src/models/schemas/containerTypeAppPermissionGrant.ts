/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import {
    baseResourceSchema,
    containerTypeAppPermissionSchema
} from './shared';

/**
 * Full fileStorageContainerTypeAppPermissionGrant schema
 * Based on Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertypeapppermissiongrant
 */
export const containerTypeAppPermissionGrantSchema = baseResourceSchema.extend({
    appId: z.string(),
    applicationPermissions: z.array(containerTypeAppPermissionSchema),
    delegatedPermissions: z.array(containerTypeAppPermissionSchema)
});

/**
 * Schema for creating a new containerTypeAppPermissionGrant
 * Excludes read-only fields like etag, @odata.type
 */
export const containerTypeAppPermissionGrantCreateSchema = containerTypeAppPermissionGrantSchema.omit({
    etag: true,
    ['@odata.type']: true
}).extend({
    // Make permission arrays default to empty arrays if not provided
    applicationPermissions: z.array(containerTypeAppPermissionSchema).default([]),
    delegatedPermissions: z.array(containerTypeAppPermissionSchema).default([])
});

/**
 * Schema for updating an existing containerTypeAppPermissionGrant
 * Makes most fields optional except for read-only ones which are omitted
 */
export const containerTypeAppPermissionGrantUpdateSchema = containerTypeAppPermissionGrantSchema.omit({
    etag: true,
    ['@odata.type']: true
}).partial().extend({
    // Ensure appId remains required for updates to identify the target
    appId: z.string()
});

/**
 * Schema for containerTypeAppPermissionGrant responses from API calls
 * Includes all possible fields that might be returned
 */
export const containerTypeAppPermissionGrantResponseSchema = containerTypeAppPermissionGrantSchema;

/**
 * Schema for permission arrays only (useful for partial updates)
 */
export const permissionArraySchema = z.object({
    applicationPermissions: z.array(containerTypeAppPermissionSchema).optional(),
    delegatedPermissions: z.array(containerTypeAppPermissionSchema).optional()
});

// Export inferred types
export type ContainerTypeAppPermissionGrant = z.infer<typeof containerTypeAppPermissionGrantSchema>;
export type ContainerTypeAppPermissionGrantCreate = z.infer<typeof containerTypeAppPermissionGrantCreateSchema>;
export type ContainerTypeAppPermissionGrantUpdate = z.infer<typeof containerTypeAppPermissionGrantUpdateSchema>;
export type ContainerTypeAppPermissionGrantResponse = z.infer<typeof containerTypeAppPermissionGrantResponseSchema>;
export type PermissionArray = z.infer<typeof permissionArraySchema>;