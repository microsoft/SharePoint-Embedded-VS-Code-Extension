/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Note: Legacy model classes have been replaced with Zod schemas
// See ./schemas for the new type-safe schema definitions

// Export new Zod schemas and types with clear naming
export * from './schemas';

// Export telemetry models
export * from './telemetry/telemetry';

// Backward compatibility type aliases
// These map old model names to new schema-based types
import type {
    Application,
    ContainerType,
    ContainerTypeRegistration,
    ContainerTypeAppPermissionGrant
} from './schemas';

import type { AuthenticatedAccount } from '../services/AuthenticationState';

// Re-export with legacy names for backward compatibility
export type App = Application;
export type Account = AuthenticatedAccount;

// Note: Container type is directly exported from schemas, no need for alias