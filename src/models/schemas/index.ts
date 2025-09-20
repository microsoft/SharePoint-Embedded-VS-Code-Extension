/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-export all shared types and schemas
export * from './shared';

// Re-export Application schemas and types
export * from './application';

// Re-export ContainerType schemas and types
export * from './containerType';

// Re-export ContainerTypeRegistration schemas and types
export * from './containerTypeRegistration';

// Re-export ContainerTypeAppPermissionGrant schemas and types
export * from './containerTypeAppPermissionGrant';

// Re-export ARM schemas and types
export * from './arm';

// Convenience re-exports for commonly used schemas
export {
    applicationSchema,
    applicationCreateSchema,
    applicationUpdateSchema
} from './application';

export {
    containerTypeSchema,
    containerTypeCreateSchema,
    containerTypeUpdateSchema,
    containerTypeResponseSchema
} from './containerType';

export {
    containerTypeRegistrationSchema,
    containerTypeRegistrationCreateSchema,
    containerTypeRegistrationUpdateSchema,
    containerTypeRegistrationResponseSchema
} from './containerTypeRegistration';

export {
    containerTypeAppPermissionGrantSchema,
    containerTypeAppPermissionGrantCreateSchema,
    containerTypeAppPermissionGrantUpdateSchema,
    containerTypeAppPermissionGrantResponseSchema,
    permissionArraySchema
} from './containerTypeAppPermissionGrant';