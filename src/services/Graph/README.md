# Graph Provider

A comprehensive TypeScript provider for Microsoft Graph APIs, supporting both core application management and SharePoint Embedded container operations.

## Overview

The GraphProvider implements a singleton pattern and provides strongly-typed methods for interacting with:

- **Applications** (`application`) - Manage Microsoft Entra applications and their configurations
- **Container Types** (`fileStorageContainerType`) - Define settings and billing for SharePoint Embedded applications
- **Container Type Registrations** (`fileStorageContainerTypeRegistration`) - Register container types in tenants
- **App Permission Grants** (`fileStorageContainerTypeAppPermissionGrant`) - Manage application permissions for container types

## Architecture

```
GraphProvider (Singleton)
├── ApplicationService
├── ContainerTypeService
├── ContainerTypeRegistrationService
└── ContainerTypeAppPermissionGrantService
```

Each service uses Zod schemas for runtime validation and TypeScript type safety.

## Usage

### Initialize the Provider

```typescript
import { GraphProvider } from '../services/Graph';
import { BaseAuthProvider } from '../services/BaseAuthProvider';

// Initialize with auth provider (first time only)
const authProvider = new YourAuthProvider();
const graph = GraphProvider.getInstance(authProvider);

// Subsequent calls don't need auth provider
const graph2 = GraphProvider.getInstance();
```

### Application Operations

```typescript
// List all applications
const result = await graph.applications.list();
console.log(`Found ${result.applications.length} applications`);

// Get specific application by Object ID
const app = await graph.applications.get('application-object-id');

// Create new application
const newApp = await graph.applications.create({
    displayName: 'My Application',
    signInAudience: 'AzureADMyOrg'
});

// Add password credential
const password = await graph.applications.addPassword(newApp.id, {
    displayName: 'API Secret',
    endDateTime: '2025-12-31T23:59:59Z'
});

// Add certificate credential
const certificate = await graph.applications.addKey(newApp.id, {
    keyCredential: {
        type: 'AsymmetricX509Cert',
        usage: 'Verify',
        key: 'base64-certificate-data'
    },
    passwordCredential: null,
    proof: 'proof-of-possession-jwt'
});

// Search applications
const searchResults = await graph.applications.search('Web');

// Get applications with few owners (security review)
const needOwners = await graph.applications.getWithFewOwners(1);
```

// Get application by Application (Client) ID
const appByClientId = await graph.applications.get('client-id', { useAppId: true });

// Create new application
const newApp = await graph.applications.create({
    displayName: 'My New Application',
    signInAudience: 'AzureADMyOrg',
    web: {
        redirectUris: ['https://localhost:3000/callback']
    }
});

// Update application
await graph.applications.update('application-id', {
    displayName: 'Updated Application Name'
});

// Delete application
await graph.applications.delete('application-id');

// Search applications
const searchResults = await graph.applications.search('Web App');

// Find applications with few owners
const needOwners = await graph.applications.getWithFewOwners(1);

// Upsert application (create or update)
const upsertResult = await graph.applications.upsert('unique-name', {
    displayName: 'My Unique App'
});
```

### Container Type Operations

```typescript
// List all container types
const containerTypes = await graph.containerTypes.list();

// Get specific container type
const containerType = await graph.containerTypes.get('container-type-id');

// Create new container type
const newContainerType = await graph.containerTypes.create({
    name: "My Container Type",
    owningAppId: "app-id-guid",
    billingClassification: "trial",
    settings: {
        urlTemplate: "https://myapp.com/{containerId}",
        isDiscoverabilityEnabled: true
    }
});

// Update container type (requires ETag)
const updated = await graph.containerTypes.update(
    'container-type-id',
    { name: "Updated Name" },
    'etag-value'
);

// Search container types
const searchResults = await graph.containerTypes.search('My App');

// Get container types by owning app
const appContainerTypes = await graph.containerTypes.getByOwningApp('app-id');

// Get expiring trial container types
const expiring = await graph.containerTypes.getExpiringTrials(30); // 30 days
```

### Container Type Registration Operations

```typescript
// List registrations
const registrations = await graph.registrations.list();

// Get specific registration
const registration = await graph.registrations.get('container-type-id');

// Register a container type in current tenant
const newRegistration = await graph.registrations.register('container-type-id', {
    applicationPermissionGrants: [
        {
            appId: "app-id",
            delegatedPermissions: ["readContent", "writeContent"],
            applicationPermissions: ["full"]
        }
    ]
});

// Update registration
const updatedReg = await graph.registrations.update('container-type-id', {
    settings: {
        urlTemplate: "https://updated.com/{containerId}"
    }
});

// Unregister container type
await graph.registrations.unregister('container-type-id');

// Check if container type is registered
const isRegistered = await graph.registrations.isRegistered('container-type-id');

// Get registrations with invalid billing
const invalidBilling = await graph.registrations.getInvalidBilling();
```

### App Permission Grant Operations

```typescript
// List permission grants for a registration
const grants = await graph.appPermissionGrants.list('registration-id');

// Get specific app permission grant
const grant = await graph.appPermissionGrants.get('registration-id', 'app-id');

// Create or replace permission grant
const newGrant = await graph.appPermissionGrants.createOrReplace(
    'registration-id',
    'app-id',
    {
        appId: 'app-id',
        delegatedPermissions: ['readContent'],
        applicationPermissions: ['read']
    }
);

// Update existing permission grant
const updatedGrant = await graph.appPermissionGrants.update(
    'registration-id',
    'app-id',
    {
        appId: 'app-id',
        delegatedPermissions: ['full']
    }
);

// Delete permission grant
await graph.appPermissionGrants.delete('registration-id', 'app-id');

// Convenience methods
await graph.appPermissionGrants.grantFullPermissions('registration-id', 'app-id');
await graph.appPermissionGrants.grantReadOnlyPermissions('registration-id', 'app-id');

// Update specific permission types
await graph.appPermissionGrants.updateApplicationPermissions(
    'registration-id',
    'app-id',
    ['read', 'write']
);

await graph.appPermissionGrants.updateDelegatedPermissions(
    'registration-id',
    'app-id',
    ['readContent', 'writeContent']
);

// Check permissions
const { hasApplication, hasDelegated, grant } = await graph.appPermissionGrants.hasPermissions(
    'registration-id',
    'app-id',
    ['read'], // required application permissions
    ['readContent'] // required delegated permissions
);
```

## Query Options

All list methods support OData query parameters:

```typescript
// Using query options
const containerTypes = await graph.containerTypes.list({
    filter: "billingClassification eq 'trial'",
    select: ['id', 'name', 'expirationDateTime'],
    orderBy: 'createdDateTime desc',
    top: 10,
    skip: 0
});
```

## Error Handling

The provider includes comprehensive error handling:

```typescript
try {
    const containerType = await graph.containerTypes.get('non-existent-id');
    // Returns null for 404 errors
    if (!containerType) {
        console.log('Container type not found');
    }
} catch (error) {
    // Other errors are thrown
    console.error('API error:', error);
}
```

## Type Safety

All methods use Zod schemas for runtime validation and TypeScript types for compile-time safety:

```typescript
import type {
    ContainerType,
    ContainerTypeCreate,
    ContainerTypeUpdate,
    ContainerTypeRegistration,
    ContainerTypeAppPermissionGrant,
    BillingClassification,
    ContainerTypeAppPermission
} from '../models/schemas';

// TypeScript will catch type errors at compile time
const create: ContainerTypeCreate = {
    name: "Test",
    owningAppId: "valid-guid",
    // billingClassification: "invalid-value", // ❌ TypeScript error
    billingClassification: "trial" // ✅ Valid
};
```

## API Reference

Based on Microsoft Graph Beta APIs:
- [fileStorageContainerType](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertype?view=graph-rest-beta)
- [fileStorageContainerTypeRegistration](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertyperegistration?view=graph-rest-beta)
- [fileStorageContainerTypeAppPermissionGrant](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertypeapppermissiongrant?view=graph-rest-beta)

## Permissions Required

- **FileStorageContainerType.Manage.All** (for container types)
- **FileStorageContainerTypeReg.Selected** or **FileStorageContainerTypeReg.Manage.All** (for registrations and permissions)
- **SharePoint Embedded admin** or **Global admin** role when using delegated tokens
