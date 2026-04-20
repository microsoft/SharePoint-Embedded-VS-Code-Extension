# ApplicationService Documentation

The `ApplicationService` provides comprehensive methods for managing Microsoft Entra applications via the Microsoft Graph API. This service handles all standard application operations including creation, reading, updating, deletion, and advanced querying capabilities.

## Features

- **Full CRUD Operations**: Create, read, update, and delete applications
- **Credential Management**: Add and remove password and key credentials
- **Advanced Querying**: Support for filtering, searching, sorting, and pagination
- **Flexible Identification**: Access applications by Object ID or Application (Client) ID
- **Upsert Operations**: Create or update applications based on uniqueName
- **Type Safety**: Full TypeScript support with Zod validation
- **Specialized Queries**: Built-in methods for common scenarios

## API Methods

### Basic Operations

#### `list(options?)`
Retrieve a list of applications with optional filtering and pagination.

```typescript
// Get all applications
const result = await graph.applications.list();
console.log(`Found ${result.applications.length} applications`);

// Get applications with filtering and pagination
const filtered = await graph.applications.list({
    filter: "signInAudience eq 'AzureADMyOrg'",
    select: ['id', 'displayName', 'appId'],
    orderBy: 'displayName',
    top: 10,
    count: true
});
```

**Options:**
- `filter`: OData filter expression
- `select`: Array of properties to include
- `orderBy`: Property to sort by
- `search`: Search term for display name
- `top`: Maximum number of results
- `skip`: Number of results to skip
- `count`: Include total count in response

#### `get(idOrAppId, options?)`
Retrieve a specific application by Object ID or Application (Client) ID.

```typescript
// Get by Object ID
const app = await graph.applications.get('12345678-1234-1234-1234-123456789012');

// Get by Application (Client) ID
const appByClientId = await graph.applications.get('87654321-4321-4321-4321-210987654321', {
    useAppId: true,
    select: ['id', 'displayName', 'signInAudience']
});
```

**Options:**
- `useAppId`: Set to true to use Application (Client) ID instead of Object ID
- `select`: Array of properties to include

#### `create(application)`
Create a new application.

```typescript
const newApp = await graph.applications.create({
    displayName: 'My New Application',
    signInAudience: 'AzureADMyOrg',
    web: {
        redirectUris: ['https://localhost:3000/callback']
    },
    requiredResourceAccess: [{
        resourceAppId: '00000003-0000-0000-c000-000000000000', // Microsoft Graph
        resourceAccess: [{
            id: 'e1fe6dd8-ba31-4d61-89e7-88639da4683d', // User.Read
            type: 'Scope'
        }]
    }]
});

console.log(`Created application: ${newApp.displayName} (${newApp.appId})`);
```

#### `update(idOrAppId, updates, options?)`
Update an existing application.

```typescript
// Update by Object ID
await graph.applications.update('12345678-1234-1234-1234-123456789012', {
    displayName: 'Updated Application Name',
    signInAudience: 'AzureADMultipleOrgs'
});

// Update by Application (Client) ID
await graph.applications.update('87654321-4321-4321-4321-210987654321', {
    web: {
        redirectUris: ['https://myapp.com/callback', 'https://localhost:3000/callback']
    }
}, { useAppId: true });
```

#### `delete(idOrAppId, options?)`
Delete an application.

```typescript
// Delete by Object ID
await graph.applications.delete('12345678-1234-1234-1234-123456789012');

// Delete by Application (Client) ID
await graph.applications.delete('87654321-4321-4321-4321-210987654321', { useAppId: true });
```

### Advanced Operations

#### `upsert(uniqueName, application)`
Create a new application if it doesn't exist, or update if it does (based on uniqueName).

```typescript
const result = await graph.applications.upsert('my-unique-app', {
    displayName: 'My Unique Application',
    signInAudience: 'AzureADMyOrg'
});

if (result) {
    console.log('Created new application:', result.appId);
} else {
    console.log('Updated existing application');
}
```

#### `search(searchTerm, options?)`
Search for applications by display name.

```typescript
const searchResults = await graph.applications.search('Web', {
    select: ['id', 'displayName', 'appId'],
    top: 20,
    count: true
});

console.log(`Found ${searchResults.count} applications matching "Web"`);
searchResults.applications.forEach(app => {
    console.log(`- ${app.displayName} (${app.appId})`);
});
```

#### `getWithFewOwners(maxOwners?, options?)`
Find applications with fewer than the specified number of owners.

```typescript
// Get applications with 0 or 1 owners
const appsNeedingOwners = await graph.applications.getWithFewOwners(1, {
    select: ['id', 'displayName'],
    count: true
});

console.log(`Found ${appsNeedingOwners.count} applications that need more owners`);
```

#### `getByIdentifierUriScheme(scheme, options?)`
Find applications with identifier URIs using a specific scheme.

```typescript
// Get applications with API URIs
const apiApps = await graph.applications.getByIdentifierUriScheme('api://', {
    select: ['id', 'displayName', 'identifierUris'],
    top: 50
});

console.log(`Found ${apiApps.applications.length} applications with API URIs`);
```

#### `getBySignInAudience(audience, options?)`
Find applications with a specific sign-in audience.

```typescript
// Get multi-tenant applications
const multiTenantApps = await graph.applications.getBySignInAudience('AzureADMultipleOrgs', {
    select: ['id', 'displayName', 'signInAudience'],
    count: true
});

console.log(`Found ${multiTenantApps.count} multi-tenant applications`);
```

### Credential Management

#### `addPassword(idOrAppId, passwordCredential?, options?)`
Add a password credential (secret) to an application.

```typescript
// Add a password with default settings
const password = await graph.applications.addPassword('12345678-1234-1234-1234-123456789012');
console.log(`Generated password: ${password.secretText}`);
console.log(`Password hint: ${password.hint}`);

// Add a password with custom settings
const customPassword = await graph.applications.addPassword('app-id', {
    displayName: 'My API Secret',
    endDateTime: '2025-12-31T23:59:59Z'
}, { useAppId: true });
```

#### `removePassword(idOrAppId, keyId, options?)`
Remove a password credential from an application.

```typescript
// Remove by Object ID
await graph.applications.removePassword('12345678-1234-1234-1234-123456789012', 'password-key-id');

// Remove by Application (Client) ID
await graph.applications.removePassword('app-id', 'password-key-id', { useAppId: true });
```

#### `addKey(idOrAppId, keyCredentialRequest, options?)`
Add a key credential (certificate) to an application.

```typescript
// Add a certificate for token verification
const keyCredential = await graph.applications.addKey('12345678-1234-1234-1234-123456789012', {
    keyCredential: {
        type: 'AsymmetricX509Cert',
        usage: 'Verify',
        key: 'MIIDYDCCAki...' // Base64 encoded certificate
    },
    passwordCredential: null,
    proof: 'eyJ0eXAiOiJ...' // Self-signed JWT proof of possession
});

// Add a certificate with password for signing
const signingKey = await graph.applications.addKey('app-id', {
    keyCredential: {
        type: 'X509CertAndPassword',
        usage: 'Sign',
        key: 'MIIDYDCCAki...'
    },
    passwordCredential: {
        secretText: 'certificate-password'
    },
    proof: 'eyJ0eXAiOiJ...'
}, { useAppId: true });
```

#### `removeKey(idOrAppId, keyId, proof, options?)`
Remove a key credential from an application.

```typescript
// Remove a key credential
await graph.applications.removeKey(
    '12345678-1234-1234-1234-123456789012',
    'key-credential-id',
    'eyJ0eXAiOiJ...' // Proof of possession JWT
);

// Remove by Application (Client) ID
await graph.applications.removeKey(
    'app-id',
    'key-credential-id', 
    'eyJ0eXAiOiJ...',
    { useAppId: true }
);
```

## Error Handling

All methods handle common errors gracefully:

```typescript
try {
    const app = await graph.applications.get('invalid-id');
    if (!app) {
        console.log('Application not found');
    }
} catch (error) {
    console.error('Error retrieving application:', error.message);
}
```

## Type Safety

The service provides full TypeScript support with Zod validation:

```typescript
import { Application, ApplicationCreate, ApplicationUpdate } from '../models/schemas';

// TypeScript will enforce correct property types
const createData: ApplicationCreate = {
    displayName: 'My App', // Required
    signInAudience: 'AzureADMyOrg', // Enum validated
    // Other optional properties...
};

const updateData: ApplicationUpdate = {
    displayName: 'Updated Name', // All properties optional
    // Partial update supported
};
```

## Common Patterns

### Creating a Web Application
```typescript
const webApp = await graph.applications.create({
    displayName: 'My Web Application',
    signInAudience: 'AzureADMyOrg',
    web: {
        redirectUris: ['https://myapp.com/callback'],
        implicitGrantSettings: {
            enableIdTokenIssuance: true,
            enableAccessTokenIssuance: false
        }
    },
    requiredResourceAccess: [{
        resourceAppId: '00000003-0000-0000-c000-000000000000',
        resourceAccess: [
            { id: 'e1fe6dd8-ba31-4d61-89e7-88639da4683d', type: 'Scope' }, // User.Read
            { id: '64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0', type: 'Scope' }  // email
        ]
    }]
});
```

### Creating a SPA Application
```typescript
const spaApp = await graph.applications.create({
    displayName: 'My SPA Application',
    signInAudience: 'AzureADandPersonalMicrosoftAccount',
    isFallbackPublicClient: true,
    spa: {
        redirectUris: ['https://myapp.com/', 'http://localhost:3000/']
    }
});
```

### Bulk Operations
```typescript
// Get all applications that need attention
const appsToReview = await graph.applications.list({
    filter: "signInAudience eq 'AzureADandPersonalMicrosoftAccount'",
    select: ['id', 'displayName', 'createdDateTime'],
    orderBy: 'createdDateTime desc'
});

// Process each application
for (const app of appsToReview.applications) {
    // Perform operations on each app
    console.log(`Processing: ${app.displayName}`);
}
```

### Managing Application Credentials
```typescript
// Add a new client secret
const secret = await graph.applications.addPassword('app-id', {
    displayName: 'Production API Secret',
    endDateTime: '2025-12-31T23:59:59Z'
}, { useAppId: true });

// Store the secret securely (it won't be retrievable later)
console.log('New secret:', secret.secretText);

// Add a certificate for JWT signing
const certificate = await graph.applications.addKey('app-id', {
    keyCredential: {
        type: 'AsymmetricX509Cert',
        usage: 'Verify',
        key: certificateBase64String
    },
    passwordCredential: null,
    proof: proofOfPossessionJWT
}, { useAppId: true });

// Remove expired credentials
await graph.applications.removePassword('app-id', expiredSecretKeyId, { useAppId: true });
await graph.applications.removeKey('app-id', expiredCertKeyId, proofJWT, { useAppId: true });
```

### Certificate Rolling Pattern
```typescript
// Automated certificate rolling
async function rollCertificate(appId: string, newCertBase64: string, oldCertKeyId: string) {
    // Add new certificate first
    const newCert = await graph.applications.addKey(appId, {
        keyCredential: {
            type: 'AsymmetricX509Cert',
            usage: 'Verify',
            key: newCertBase64
        },
        passwordCredential: null,
        proof: generateProofOfPossession() // Generate JWT proof
    }, { useAppId: true });
    
    // Allow time for propagation before removing old certificate
    setTimeout(async () => {
        await graph.applications.removeKey(
            appId, 
            oldCertKeyId, 
            generateProofOfPossession(),
            { useAppId: true }
        );
    }, 300000); // Wait 5 minutes
    
    return newCert;
}
```

## Integration with GraphProvider

The ApplicationService is automatically available through the GraphProvider:

```typescript
import { GraphProvider } from '../services/Graph';

// Initialize provider (done once)
const graph = GraphProvider.getInstance(authProvider);

// Use application service
const apps = await graph.applications.list();
const myApp = await graph.applications.get('app-id');
```

## Related Resources

- [Microsoft Graph Application API Reference](https://learn.microsoft.com/en-us/graph/api/resources/application?view=graph-rest-1.0)
- [Application registration in Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Application permissions and consent](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview)
- [Add Password API Reference](https://learn.microsoft.com/en-us/graph/api/application-addpassword)
- [Add Key API Reference](https://learn.microsoft.com/en-us/graph/api/application-addkey)
- [Certificate credentials for application authentication](https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials)
- [Generating proof of possession tokens for rolling keys](https://learn.microsoft.com/en-us/graph/application-rollkey-prooftoken)