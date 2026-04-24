/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

/**
 * userType values returned by Graph /users.
 * 'Member' = tenant directory member, 'Guest' = B2B guest.
 */
export const userTypeSchema = z.enum(['Member', 'Guest']);

/**
 * Tenant user (Graph /v1.0/users). Loose — tolerate unknown fields so we
 * don't break when Graph adds properties.
 */
export const userSchema = z.object({
    id: z.string(),
    displayName: z.string().nullable().optional(),
    userPrincipalName: z.string().nullable().optional(),
    mail: z.string().nullable().optional(),
    userType: userTypeSchema.nullable().optional(),
    jobTitle: z.string().nullable().optional(),
    givenName: z.string().nullable().optional(),
    surname: z.string().nullable().optional(),
    accountEnabled: z.boolean().nullable().optional()
}).passthrough();

export type User = z.infer<typeof userSchema>;
export type UserType = z.infer<typeof userTypeSchema>;
