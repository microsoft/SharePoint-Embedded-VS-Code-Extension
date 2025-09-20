/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Export existing model classes
export * from './Account';
export * from './App';
export * from './ApplicationPermissions';
export * from './Container';

// Export existing ContainerType class and interfaces (avoiding conflicts with Zod schemas)
export {
    ContainerType as ContainerTypeClass,
    BillingClassification as LegacyBillingClassification,
    BillingStatus as LegacyBillingStatus,
    IApplicationPermissions,
    IContainerTypeProperties,
    IContainerTypeCreationProperties,
    IContainerTypeUpdateProperties,
    IContainerTypeSettings,
    IConsumingApplicationProperties
} from './ContainerType';

// Export existing ContainerTypeRegistration class (avoiding conflicts with Zod schemas)
export {
    ContainerTypeRegistration as ContainerTypeRegistrationClass
} from './ContainerTypeRegistration';

// Export new Zod schemas and types with clear naming
export * from './schemas';

// Export telemetry models
export * from './telemetry/telemetry';