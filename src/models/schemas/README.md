# Zod Schemas for SharePoint Embedded Models

This directory contains Zod schemas for SharePoint Embedded container types and related resources based on the Microsoft Graph API.

## Overview

The schemas are organized into separate files for better maintainability:

- `shared.ts` - Common types, enums, and base schemas
- `containerType.ts` - Schemas for fileStorageContainerType resource
- `containerTypeRegistration.ts` - Schemas for fileStorageContainerTypeRegistration resource  
- `containerTypeAppPermissionGrant.ts` - Schemas for fileStorageContainerTypeAppPermissionGrant resource
- `index.ts` - Central export file

## Usage Examples

### Validating a Container Type Creation

```typescript
import { containerTypeCreateSchema, ContainerTypeCreate } from '../models/schemas';

const newContainerType: ContainerTypeCreate = {
    name: "My Container Type",
    owningAppId: "12345678-1234-1234-1234-123456789012",
    billingClassification: "standard",
    billingStatus: "valid",
    settings: {
        urlTemplate: "https://example.com/{containerId}",
        isDiscoverabilityEnabled: true
    }
};

// Validate the data
const validatedData = containerTypeCreateSchema.parse(newContainerType);
```

### Validating API Responses

```typescript
import { containerTypeResponseSchema } from '../models/schemas';

const apiResponse = await fetch('/api/containerTypes/123');
const data = await apiResponse.json();

// Validate the response matches expected schema
const containerType = containerTypeResponseSchema.parse(data);
```

### Partial Updates

```typescript
import { containerTypeUpdateSchema } from '../models/schemas';

const updateData = {
    name: "Updated Container Type Name",
    settings: {
        isDiscoverabilityEnabled: false
    }
};

// Validate the update data
const validatedUpdate = containerTypeUpdateSchema.parse(updateData);
```

## Schema Types

Each resource has multiple schema variants:

1. **Full Schema** (e.g., `containerTypeSchema`) - Complete resource with all fields
2. **Create Schema** (e.g., `containerTypeCreateSchema`) - For creating new resources (excludes read-only fields)
3. **Update Schema** (e.g., `containerTypeUpdateSchema`) - For updating existing resources (most fields optional)
4. **Response Schema** (e.g., `containerTypeResponseSchema`) - For validating API responses

## Type Safety

All schemas export corresponding TypeScript types:

```typescript
import type { 
    ContainerType,
    ContainerTypeCreate,
    ContainerTypeUpdate,
    ContainerTypeResponse 
} from '../models/schemas';
```

## Error Handling

Use Zod's built-in error handling for validation:

```typescript
import { containerTypeCreateSchema } from '../models/schemas';

try {
    const validated = containerTypeCreateSchema.parse(userInput);
    // Proceed with validated data
} catch (error) {
    if (error instanceof z.ZodError) {
        console.error('Validation errors:', error.errors);
    }
}
```

## Microsoft Graph API Reference

These schemas are based on the Microsoft Graph API beta endpoints:

- [fileStorageContainerType](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertype?view=graph-rest-beta)
- [fileStorageContainerTypeRegistration](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertyperegistration?view=graph-rest-beta)
- [fileStorageContainerTypeAppPermissionGrant](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertypeapppermissiongrant?view=graph-rest-beta)