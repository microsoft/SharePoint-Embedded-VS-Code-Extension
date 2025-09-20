# ARM Provider with Zod Schemas

The ARMProvider has been updated to use Zod schemas for type-safe validation and better developer experience, following the same pattern used by Graph resources.

## Benefits

### Type Safety
- **Compile-time checking**: TypeScript knows the exact structure of ARM resources
- **Runtime validation**: Zod schemas validate API responses at runtime
- **IntelliSense support**: Full autocomplete for all properties

### Error Handling
- **Detailed validation errors**: Know exactly which fields are missing or invalid
- **Schema validation**: Catch API response structure changes early
- **Type coercion**: Automatic conversion of compatible types

### Developer Experience
- **Consistent patterns**: Same schema approach as Graph resources
- **Easy validation**: Built-in methods for validating external data
- **Self-documenting**: Schema definitions serve as documentation

## Schema Structure

### Core Schemas
- `armSubscriptionSchema` - Azure subscriptions
- `armResourceGroupSchema` - Resource groups
- `armAccountSchema` - Syntex accounts
- `armSyntexProviderSchema` - Syntex resource provider

### Collection Responses
- `armSubscriptionsResponseSchema` - Subscription collections
- `armResourceGroupsResponseSchema` - Resource group collections  
- `armAccountsResponseSchema` - Account collections

### Enums
- `armProviderRegistrationStateSchema` - Provider registration states
- `armAccountIdentityTypeSchema` - Account identity types
- `armAccountFeatureSchema` - Account features
- `armProvisioningStateSchema` - Provisioning states

## Usage Examples

### Basic Usage
```typescript
const armProvider = new ARMProvider(armAuth);

// Type-safe method calls with automatic validation
const subscriptions: ArmSubscription[] = await armProvider.getSubscriptions();
const accounts: ArmAccount[] = await armProvider.getArmAccounts(subId, rgName);
```

### Creating Resources
```typescript
// Type-safe account creation
const newAccount: ArmAccount = await armProvider.createArmAccount(
    'subscription-id',
    'resource-group-name', 
    'East US',
    'container-type-id'
);
```

### Manual Validation
```typescript
// Validate external data
const validAccount: ArmAccount = armProvider.validateAccount(unknownData);

// Validate API responses
const validResponse: ArmAccountsResponse = armProvider.validateAccountsResponse(apiData);
```

### Error Handling
```typescript
try {
    const account = await armProvider.getArmAccounts(subId, rgName);
} catch (error) {
    if (error instanceof z.ZodError) {
        // Handle schema validation errors
        console.error('Invalid API response structure:', error.issues);
    } else {
        // Handle other errors (network, auth, etc.)
        console.error('API call failed:', error);
    }
}
```

## Schema Files

- `/models/schemas/arm.ts` - All ARM-related schemas
- `/models/schemas/index.ts` - Schema exports

## Type Exports

All schemas automatically generate TypeScript types:

```typescript
import { 
    ArmSubscription,
    ArmResourceGroup, 
    ArmAccount,
    ArmAccountCreate,
    ArmSubscriptionsResponse
} from '../models/schemas';
```

## Migration from Interfaces

**Before:**
```typescript
interface IArmAccountProperties {
    id: string;
    // ... manual interface definition
}

// No runtime validation
const account = response.data as IArmAccountProperties;
```

**After:**
```typescript
import { ArmAccount, armAccountSchema } from '../services/schemas';

// Runtime validation + compile-time types
const account: ArmAccount = armAccountSchema.parse(response.data);
```

## Best Practices

1. **Always use typed methods**: Prefer `getSubscriptions()` over manual API calls
2. **Validate external data**: Use validation methods for user input or external APIs
3. **Handle validation errors**: Check for `ZodError` specifically
4. **Leverage TypeScript**: Let IntelliSense guide property access
5. **Use schema types**: Import types from schemas, not interfaces