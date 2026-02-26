# SharePoint Embedded VS Code Extension — API Endpoint Reference

> **Purpose**: Comprehensive inventory of every API endpoint the extension calls or may call. Use this to ensure all Logical Permissions (LPs) are implemented on the server. Missing an LP = broken in production.
>
> **Last Updated**: 2026-02-13 | **Branch**: auth-refactor-alex

---

## Table of Contents

1. [SharePoint Embedded APIs (Require LP Annotations)](#1-sharepoint-embedded-apis-require-lp-annotations)
   - [1.1 Container Types](#11-container-types-controller)
   - [1.2 Container Type Registrations](#12-container-type-registrations-controller)
   - [1.3 App Permission Grants](#13-app-permission-grants-controller)
   - [1.4 Containers](#14-containers-controller)
   - [1.5 Deleted Containers](#15-deleted-containers-controller)
   - [1.6 Container Permissions](#16-container-permissions-sub-resource)
   - [1.7 Container Custom Properties](#17-container-custom-properties-sub-resource)
   - [1.8 Container Recycle Bin, Columns, & Other Sub-Resources](#18-container-recycle-bin-columns--other-sub-resources)
2. [Microsoft Graph Standard APIs](#2-microsoft-graph-standard-apis)
   - [2.1 Applications](#21-applications)
   - [2.2 Service Principals](#22-service-principals)
   - [2.3 Sites](#23-sites)
3. [Azure Resource Manager (ARM) APIs](#3-azure-resource-manager-arm-apis)
4. [Authentication & Consent Endpoints](#4-authentication--consent-endpoints)
5. [Legacy SharePoint Admin APIs (Deprecated)](#5-legacy-sharepoint-admin-apis-deprecated)
6. [Required OAuth Scopes](#6-required-oauth-scopes)
7. [LP Implementation Checklist](#7-lp-implementation-checklist)

---

## 1. SharePoint Embedded APIs (Require LP Annotations)

All endpoints under `/storage/fileStorage/` are SharePoint Embedded APIs routed through the SPE service. These require Logical Permission annotations to work for tenant admin users.

### 1.1 Container Types Controller

**Controller**: `FileStorageContainerTypesController`
**Graph Path**: `/storage/fileStorage/containerTypes`
**API Version**: `v1.0`
**Code**: `src/services/Graph/ContainerTypeService.ts`

| # | Method | Endpoint | Operation | LP | Used in Code | Code Reference |
|---|--------|----------|-----------|-----|-------------|----------------|
| 1 | POST | `/storage/fileStorage/containerTypes` | Create a new container type | Not Implemented | Yes | `ContainerTypeService.create()`, `CreateTrialContainerType.ts` |
| 2 | GET | `/storage/fileStorage/containerTypes` | List all container types | Not Implemented | Yes | `ContainerTypeService.list()`, `DevelopmentTreeViewProvider.ts` |
| 3 | GET | `/storage/fileStorage/containerTypes/{containerTypeId}` | Get a container type by ID | Not Implemented | Yes | `ContainerTypeService.get()` — called before every PATCH for ETag retrieval |
| 4 | PATCH | `/storage/fileStorage/containerTypes/{containerTypeId}` | Update container type properties | Not Implemented | Yes | `ContainerTypeService.update()`, `RenameContainerType.ts`, `DisableDiscoverability.ts`, `EnableDiscoverability.ts` |
| 5 | DELETE | `/storage/fileStorage/containerTypes/{containerTypeId}` | Delete a container type | Not Implemented | Yes | `ContainerTypeService.delete()`, `DeleteContainerType.ts` |

> **Note**: Row 3 (`GET /containerTypes/{id}`) is required by every update operation. The code calls `ContainerTypeService.get()` to retrieve the current ETag before calling `ContainerTypeService.update()` (PATCH).

**Additional query patterns used** (all resolve to row 2 — GET List):
- `$filter=owningAppId eq '{appId}'` — `getByOwningApp()`
- `$filter=billingClassification eq 'trial'` — `getByBillingClassification()`
- `$filter=expirationDateTime gt/lt '{date}'` — `getActive()`, `getExpired()`, `getExpiringTrials()`
- `$search="displayName:{term}"` — `search()`

---

### 1.2 Container Type Registrations Controller

**Controller**: `FileStorageContainerTypeRegistrationsController`
**Graph Path**: `/storage/fileStorage/containerTypeRegistrations`
**API Version**: `v1.0`
**Code**: `src/services/Graph/ContainerTypeRegistrationService.ts`

| # | Method | Endpoint | Operation | LP | Used in Code | Code Reference |
|---|--------|----------|-----------|-----|-------------|----------------|
| 6 | PUT | `/storage/fileStorage/containerTypeRegistrations/{containerTypeId}` | Register a container type on the local tenant | Not Implemented | Yes | `ContainerTypeRegistrationService.register()`, `RegisterOnLocalTenant.ts` |
| 7 | GET | `/storage/fileStorage/containerTypeRegistrations` | List all container type registrations | Not Implemented | Yes | `ContainerTypeRegistrationService.list()` — used to test token permissions during registration flow |
| 8 | GET | `/storage/fileStorage/containerTypeRegistrations/{containerTypeId}` | Get a container type registration by ID | Not Implemented | Yes | `ContainerTypeRegistrationService.get()`, `isRegistered()` — verify registration after PUT |
| 9 | PATCH | `/storage/fileStorage/containerTypeRegistrations/{containerTypeId}` | Update a container type registration | Not Implemented | In service layer | `ContainerTypeRegistrationService.update()` — not yet called from commands |
| 10 | DELETE | `/storage/fileStorage/containerTypeRegistrations/{containerTypeId}` | Unregister a container type from the local tenant | Not Implemented | In service layer | `ContainerTypeRegistrationService.unregister()` — not yet called from commands |

**Additional query patterns** (resolve to row 7 — GET List):
- `$filter=owningAppId eq '{appId}'` — `getByOwningApp()`
- `$filter=billingClassification eq 'trial' and expirationDateTime le '{date}'` — `getExpiringTrials()`
- `$filter=billingStatus eq 'invalid'` — `getInvalidBilling()`

---

### 1.3 App Permission Grants Controller

**Controller**: `FileStorageContainerTypeAppPermissionGrantController`
**Graph Path**: `/storage/fileStorage/containerTypeRegistrations/{containerTypeId}/applicationPermissionGrants`
**API Version**: `v1.0`
**Code**: `src/services/Graph/ContainerTypeAppPermissionGrantService.ts`

| # | Method | Endpoint | Operation | LP | Used in Code | Code Reference |
|---|--------|----------|-----------|-----|-------------|----------------|
| 11 | PUT | `.../applicationPermissionGrants/{appId}` | Grant or replace app permissions on a container type | Not Implemented | Yes | `createOrReplace()`, `grantFullPermissions()`, `grantReadOnlyPermissions()` |
| 12 | GET | `.../applicationPermissionGrants` | List all app permission grants for a container type | Not Implemented | Yes | `list()` |
| 13 | GET | `.../applicationPermissionGrants/{appId}` | Get app permission grant for a specific app | Not Implemented | Yes | `get()`, `hasPermissions()` |
| 14 | PATCH | `.../applicationPermissionGrants/{appId}` | Update app permission grant for a specific app | Not Implemented | Yes | `update()`, `updateApplicationPermissions()`, `updateDelegatedPermissions()` |
| 15 | DELETE | `.../applicationPermissionGrants/{appId}` | Revoke app permissions from a container type | Not Implemented | Yes | `delete()` |

---

### 1.4 Containers Controller

**Controller**: `FileStorageContainersController` (or equivalent)
**Graph Path**: `/storage/fileStorage/containers`
**API Version**: `v1.0`
**Code**: `src/services/Graph/ContainerService.ts`

| # | Method | Endpoint | Operation | LP | Used in Code | Code Reference |
|---|--------|----------|-----------|-----|-------------|----------------|
| 16 | POST | `/storage/fileStorage/containers` | Create a new container | Not Implemented | Yes | `GraphProvider.createContainer()`, `CreateContainer.ts` |
| 17 | GET | `/storage/fileStorage/containers` | List all containers | Not Implemented | Yes | `GraphProvider.listContainers()` with `$filter=containerTypeId eq {id}` |
| 18 | GET | `/storage/fileStorage/containers/{containerId}` | Get a container by ID | Not Implemented | Yes | `GraphProvider.getContainer()` with `$expand=permissions` |
| 19 | PATCH | `/storage/fileStorage/containers/{containerId}` | Update container properties (name, description) | Not Implemented | Yes | `GraphProvider.updateContainer()`, `RenameContainer.ts`, `EditContainerDescription.ts` |
| 20 | DELETE | `/storage/fileStorage/containers/{containerId}` | Soft-delete a container (move to recycle bin) | Not Implemented | Yes | `GraphProvider.recycleContainer()`, `RecycleContainer.ts` |
| 21 | POST | `/storage/fileStorage/containers/{containerId}/activate` | Activate a container | Not Implemented | Not yet | [Graph docs](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-activate) |
| 22 | POST | `/storage/fileStorage/containers/{containerId}/lock` | Lock a container to prevent modifications | Not Implemented | Not yet | [Graph docs](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-lock) |
| 23 | POST | `/storage/fileStorage/containers/{containerId}/unlock` | Unlock a previously locked container | Not Implemented | Not yet | [Graph docs](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-unlock) |
| 24 | POST | `/storage/fileStorage/containers/{containerId}/permanentDelete` | Permanently delete a container (bypass recycle bin) | Not Implemented | Not yet | [Graph docs](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-permanentdelete) |

**Query patterns used** (resolve to row 17 — GET List):
- `$filter=containerTypeId eq {containerTypeId}` — filter containers by type
- `$select=id,displayName,description,containerTypeId,createdDateTime,storageUsedInBytes`

**Query patterns used** (resolve to row 18 — GET):
- `$select=id,displayName,containerTypeId,status,description,customProperties,settings`
- `$expand=permissions`

---

### 1.5 Deleted Containers Controller

**Controller**: `DeletedFileStorageContainersController` (or equivalent)
**Graph Path**: `/storage/fileStorage/deletedContainers`
**API Version**: `v1.0`
**Code**: `src/services/Graph/ContainerService.ts`

| # | Method | Endpoint | Operation | LP | Used in Code | Code Reference |
|---|--------|----------|-----------|-----|-------------|----------------|
| 25 | GET | `/storage/fileStorage/deletedContainers` | List all recycled (soft-deleted) containers | Not Implemented | Yes | `GraphProvider.listRecycledContainers()` with `$filter=containerTypeId eq {id}` |
| 26 | POST | `/storage/fileStorage/deletedContainers/{containerId}/restore` | Restore a recycled container | Not Implemented | Yes | `GraphProvider.restoreContainer()`, `RestoreContainer.ts` |
| 27 | DELETE | `/storage/fileStorage/deletedContainers/{containerId}` | Permanently delete a recycled container | Not Implemented | Yes | `GraphProvider.deleteContainer()`, `DeleteContainer.ts` |

---

### 1.6 Container Permissions (Sub-Resource)

**Graph Path**: `/storage/fileStorage/containers/{containerId}/permissions`
**API Version**: `v1.0`
**Code**: Not currently used directly (permissions are loaded via `$expand=permissions` on GET container)

| # | Method | Endpoint | Operation | LP | Used in Code |
|---|--------|----------|-----------|-----|-------------|
| 28 | GET | `.../containers/{containerId}/permissions` | List all permissions on a container | Not Implemented | Not directly (loaded via $expand) |
| 29 | POST | `.../containers/{containerId}/permissions` | Add a permission to a container | Not Implemented | Not yet |
| 30 | PATCH | `.../containers/{containerId}/permissions/{permissionId}` | Update a permission on a container | Not Implemented | Not yet |
| 31 | DELETE | `.../containers/{containerId}/permissions/{permissionId}` | Remove a permission from a container | Not Implemented | Not yet |

---

### 1.7 Container Custom Properties (Sub-Resource)

**Graph Path**: `/storage/fileStorage/containers/{containerId}/customProperties`
**API Version**: `v1.0`
**Code**: Not currently used

| # | Method | Endpoint | Operation | LP | Used in Code |
|---|--------|----------|-----------|-----|-------------|
| 32 | GET | `.../containers/{containerId}/customProperties` | List all custom properties on a container | Not Implemented | Not yet |
| 33 | POST | `.../containers/{containerId}/customProperties` | Add a custom property to a container | Not Implemented | Not yet |
| 34 | PATCH | `.../containers/{containerId}/customProperties` | Update a custom property on a container | Not Implemented | Not yet |
| 35 | DELETE | `.../containers/{containerId}/customProperties/{propertyName}` | Remove a custom property from a container | Not Implemented | Not yet |

---

### 1.8 Container Recycle Bin, Columns, & Other Sub-Resources

**Graph Path**: Various sub-paths of `/storage/fileStorage/containers/{containerId}/`
**Code**: Not currently used

| # | Method | Endpoint | Operation | LP | Used in Code |
|---|--------|----------|-----------|-----|-------------|
| 36 | GET | `.../containers/{containerId}/recycleBin/items` | List items in a container's recycle bin | Not Implemented | Not yet |
| 37 | POST | `.../containers/{containerId}/recycleBin/items/restore` | Restore items from a container's recycle bin | Not Implemented | Not yet |
| 38 | DELETE | `.../containers/{containerId}/recycleBin/items/{itemId}` | Permanently delete an item from a container's recycle bin | Not Implemented | Not yet |
| 39 | PATCH | `.../containers/{containerId}/recycleBin/settings` | Update recycle bin settings for a container | Not Implemented | Not yet |
| 40 | GET | `.../containers/{containerId}/columns` | List site columns defined on a container | Not Implemented | Not yet |
| 41 | GET | `.../containers/{containerId}/drive` | Get the document library (drive) for a container | Not Implemented | Not yet |
| 42 | POST | `.../containers/{containerId}/migrationJobs` | Create a content migration job for a container | Not Implemented | Not yet |
| 43 | POST | `.../containers/{containerId}/provisionMigrationContainers` | Provision migration containers for bulk migration | Not Implemented | Not yet |

---

## 2. Microsoft Graph Standard APIs

These endpoints use standard Microsoft Graph permissions (`Application.ReadWrite.All`, etc.) and may have their own permission model separate from SPE Logical Permissions.

### 2.1 Applications

**Graph Path**: `/applications`
**API Version**: `v1.0`
**Required Permission**: `Application.ReadWrite.All`
**Code**: `src/services/Graph/ApplicationService.ts`

| # | Method | Endpoint | Operation | Used in Code | Code Reference |
|---|--------|----------|-----------|-------------|----------------|
| 44 | POST | `/applications` | Create application | Yes | `ApplicationService.create()`, `CreateTrialContainerType.ts`, `GetOrCreateApp.ts` |
| 45 | GET | `/applications` | List applications | Yes | `ApplicationService.list()`, `ApplicationService.search()` |
| 46 | GET | `/applications/{id}` | Get by object ID | Yes | `ApplicationService.get()` |
| 47 | GET | `/applications(appId='{appId}')` | Get by appId (client ID) | Yes | `ApplicationService.get(id, { useAppId: true })` |
| 48 | PATCH | `/applications/{id}` | Update application | Yes | `ApplicationService.update()` — displayName, web URIs, identifierUris, requiredResourceAccess, isFallbackPublicClient |
| 49 | PATCH | `/applications(appId='{appId}')` | Update by appId | Yes | `ApplicationService.update(id, updates, { useAppId: true })` |
| 50 | PATCH | `/applications(uniqueName='{name}')` | Upsert (create-if-missing) | Yes | `ApplicationService.upsert()` with `Prefer: create-if-missing` header |
| 51 | DELETE | `/applications/{id}` | Delete application | Yes | `ApplicationService.delete()` |
| 52 | DELETE | `/applications(appId='{appId}')` | Delete by appId | Yes | `ApplicationService.delete(id, { useAppId: true })` |
| 53 | POST | `/applications/{id}/addPassword` | Add password credential | Yes | `ApplicationService.addPassword()`, `CreateTrialContainerType.ts`, `CreateSecret.ts` |
| 54 | POST | `/applications(appId='{appId}')/addPassword` | Add password by appId | Yes | `ApplicationService.addPassword(id, cred, { useAppId: true })` |
| 55 | POST | `/applications/{id}/removePassword` | Remove password credential | Yes | `ApplicationService.removePassword()` |
| 56 | POST | `/applications(appId='{appId}')/removePassword` | Remove password by appId | Yes | `ApplicationService.removePassword(id, keyId, { useAppId: true })` |
| 57 | POST | `/applications/{id}/addKey` | Add key/cert credential | Yes | `ApplicationService.addKey()`, `CreateAppCert.ts` |
| 58 | POST | `/applications(appId='{appId}')/addKey` | Add key by appId | Yes | `ApplicationService.addKey(id, cred, { useAppId: true })` |
| 59 | POST | `/applications/{id}/removeKey` | Remove key/cert credential | Yes | `ApplicationService.removeKey()` |
| 60 | POST | `/applications(appId='{appId}')/removeKey` | Remove key by appId | Yes | `ApplicationService.removeKey(id, keyId, proof, { useAppId: true })` |

**Query patterns used on List (row 45)**:
- `$filter=appId eq '{appId}'` — legacy `GraphProvider.getApp()`
- `$search="displayName:{term}" OR "appId:{term}"` — with `ConsistencyLevel: eventual`
- `$filter=owners/$count eq 0` — `getWithFewOwners()`
- `$filter=identifierUris/any(x:startswith(x,'api://'))` — `getByIdentifierUriScheme()`
- `$filter=signInAudience eq '{audience}'` — `getBySignInAudience()`
- `$select`, `$orderby`, `$top`, `$skip`, `$count`

---

### 2.2 Service Principals

**Graph Path**: `/servicePrincipals`
**API Version**: `v1.0`
**Required Permission**: `Application.ReadWrite.All`
**Code**: `src/services/Graph/ApplicationService.ts`

| # | Method | Endpoint | Operation | Used in Code | Code Reference |
|---|--------|----------|-----------|-------------|----------------|
| 61 | POST | `/servicePrincipals` | Create service principal | Yes | `ApplicationService.createServicePrincipal()` — required for container type registration |
| 62 | GET | `/servicePrincipals(appId='{appId}')` | Get by appId | Yes | `ApplicationService.getServicePrincipal()` — fallback when create returns "already exists" |

---

### 2.3 Sites

**Graph Path**: `/sites`
**API Version**: `v1.0`
**Required Permission**: implicit (part of Graph)
**Code**: `src/services/GraphProvider.ts` (legacy)

| # | Method | Endpoint | Operation | Used in Code | Code Reference |
|---|--------|----------|-----------|-------------|----------------|
| 63 | GET | `/sites/root` | Get root site URL | Yes | `GraphProvider.getRootSiteUrl()` — used to derive SharePoint Admin URL |

---

## 3. Azure Resource Manager (ARM) APIs

**Base URL**: `https://management.azure.com/`
**Required Scope**: `https://management.azure.com/user_impersonation`
**Code**: `src/services/ARMProvider.ts`

| # | Method | Endpoint | API Version | Operation | Used in Code | Code Reference |
|---|--------|----------|-------------|-----------|-------------|----------------|
| 64 | GET | `/subscriptions` | `2021-04-01` | List subscriptions | Yes | `ARMProvider.getSubscriptions()` |
| 65 | GET | `/subscriptions/{subscriptionId}` | `2021-04-01` | Get subscription | Yes | `ARMProvider.getSubscriptionById()` |
| 66 | GET | `/subscriptions/{subscriptionId}/resourceGroups` | `2021-04-01` | List resource groups | Yes | `ARMProvider.getSubscriptionResourceGroups()` |
| 67 | GET | `/subscriptions/{subscriptionId}/providers/Microsoft.Syntex` | `2021-04-01` | Get Syntex provider registration | Yes | `ARMProvider.getSyntexProvider()` |
| 68 | POST | `/subscriptions/{subscriptionId}/providers/Microsoft.Syntex/register` | `2021-04-01` | Register Syntex resource provider | Yes | `ARMProvider.createSyntexProvider()` |
| 69 | GET | `/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Syntex/accounts` | `2023-01-04-preview` | List Syntex accounts | Yes | `ARMProvider.getArmAccounts()` |
| 70 | PUT | `/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Syntex/accounts/{uuid}` | `2023-01-04-preview` | Create Syntex account (associate subscription with container type) | Yes | `ARMProvider.createArmAccount()` |

**ARM Account creation body** (row 70):
```json
{
  "location": "{region}",
  "properties": {
    "friendlyName": "CT_{containerTypeId}",
    "service": "SPO",
    "identityType": "ContainerType",
    "identityId": "{containerTypeId}",
    "feature": "RaaS",
    "scope": "Global"
  }
}
```

> **Note**: The user identified that associating an Azure Subscription with a standard container type cannot currently be done via Graph. This requires either ARM `user_impersonation` scope or a new Graph API.

---

## 4. Authentication & Consent Endpoints

These are external authentication endpoints, not Graph API resources.

### Admin Consent

| Endpoint | Purpose | Code Reference |
|----------|---------|----------------|
| `https://login.microsoftonline.com/{tenantId}/adminconsent?client_id={clientId}&redirect_uri={encodedUri}` | Request admin consent for app permissions | `src/utils/AdminConsentHelper.ts` |

**Flow**: Opens in external browser → localhost redirect server listens on ephemeral port → receives `admin_consent=True/False` response → 3 minute timeout.

### MSAL Authority URLs

| Endpoint | Purpose |
|----------|---------|
| `https://login.microsoftonline.com/common/` | Multi-tenant public client authority (PKCE flow) |
| `https://login.microsoftonline.com/{tenantId}/` | Tenant-specific authority (3P/AppOnly auth) |

---

## 5. Legacy SharePoint Admin APIs (Deprecated)

**Base URL**: `{SharePointAdminSiteUrl}/_api/SPO.Tenant/`
**Required Scope**: `{spAdminUrl}/AllSites.FullControl`
**Code**: `src/services/SPAdminProvider.ts`

> Being replaced by Graph API endpoints in Sections 1.1-1.3. Listed for completeness.

| # | Method | SPO.Tenant Method | Operation | Replacement |
|---|--------|-------------------|-----------|-------------|
| 71 | POST | `GetSPOContainerTypes` | List container types | Section 1.1 row 2 |
| 72 | POST | `GetSPOContainerTypeById` | Get container type + config | Section 1.1 row 3 |
| 73 | POST | `NewSPOContainerType` | Create container type | Section 1.1 row 1 |
| 74 | POST | `RemoveSPOContainerType` | Delete container type | Section 1.1 row 5 |
| 75 | POST | `SetSPOContainerType` | Update container type properties | Section 1.1 row 4 |
| 76 | POST | `GetSPOContainerTypeConfigurationByContainerTypeId` | Get configuration | Section 1.1 row 3 (+ settings property) |
| 77 | POST | `SetSPOContainerTypeConfiguration` | Set configuration (discoverability, etc.) | Section 1.1 row 4 (+ settings in body) |
| 78 | POST | `GetSPOSyntexConsumingApplications` | Get consuming applications | Section 1.3 row 12 |

---

## 6. Required OAuth Scopes

### Graph API Scopes (Delegated — Tenant Admin)

**Code**: `src/services/Auth/GraphAuthProvider.ts`

```
https://graph.microsoft.com/Application.ReadWrite.All
https://graph.microsoft.com/FileStorageContainer.Manage.All
https://graph.microsoft.com/FileStorageContainer.Selected
https://graph.microsoft.com/FileStorageContainerType.Manage.All
https://graph.microsoft.com/FileStorageContainerTypeReg.Manage.All
https://graph.microsoft.com/User.Read
```

### Graph API Scopes (Application-Only)

**Code**: `src/services/Auth/AppAuthProviderFactory.ts`

```
https://graph.microsoft.com/FileStorageContainer.Selected
https://graph.microsoft.com/FileStorageContainerType.Manage.All
https://graph.microsoft.com/FileStorageContainerTypeReg.Manage.All
https://graph.microsoft.com/FileStorageContainer.Manage.All
```

### Required Resource Access Scope IDs

Added to owning applications via `ApplicationService.ensureContainerTypePermissions()`:

| Scope Name | Scope ID | Type |
|------------|----------|------|
| `FileStorageContainerTypeReg.Manage.All` | `c319a7df-930e-44c0-a43b-7e5e9c7f4f24` | Delegated |
| `FileStorageContainer.Selected` | `085ca537-6565-41c2-aca7-db852babc212` | Delegated |
| `FileStorageContainerType.Manage.All` | `8e6ec84c-5fcd-4cc7-ac8a-2296efc0ed9b` | Delegated |
| `FileStorageContainer.Manage.All` | `527b6d64-cdf5-4b8b-b336-4aa0b8ca2ce5` | Delegated |
| `User.Read` | `e1fe6dd8-ba31-4d61-89e7-88639da4683d` | Delegated |

**Microsoft Graph Resource App ID**: `00000003-0000-0000-c000-000000000000`

### ARM Scope

```
https://management.azure.com/user_impersonation
```

### SharePoint Admin Scope (Legacy)

```
{spAdminUrl}/AllSites.FullControl
```

---

## 7. LP Implementation Checklist

All SPE endpoints (Section 1) require Logical Permissions. None are currently implemented. This section provides a flat checklist for the server team.

### Totals by Section

| Section | Controller / API | Total APIs | Actively Used | Needs LP |
|---------|-----------------|------------|---------------|----------|
| 1.1 | Container Types | 5 | 5 | 5 |
| 1.2 | CT Registrations | 5 | 3 | 5 |
| 1.3 | App Permission Grants | 5 | 5 | 5 |
| 1.4 | Containers | 9 | 5 | 9 |
| 1.5 | Deleted Containers | 3 | 3 | 3 |
| 1.6 | Container Permissions | 4 | 0 | 4 |
| 1.7 | Container Custom Properties | 4 | 0 | 4 |
| 1.8 | Container Sub-Resources | 8 | 0 | 8 |
| 2.x | Graph Standard APIs | 20 | 20 | N/A (standard Graph) |
| 3 | ARM | 7 | 7 | N/A (ARM permissions) |
| **TOTAL** | | **70** | **48** | **43 SPE endpoints** |

### All SPE Endpoints — Flat List

```
# Container Types (v1.0) — 5 endpoints
POST   /storage/fileStorage/containerTypes                          Needs LP
GET    /storage/fileStorage/containerTypes                          Needs LP
GET    /storage/fileStorage/containerTypes/{id}                     Needs LP
PATCH  /storage/fileStorage/containerTypes/{id}                     Needs LP
DELETE /storage/fileStorage/containerTypes/{id}                     Needs LP

# Container Type Registrations (v1.0) — 5 endpoints
PUT    /storage/fileStorage/containerTypeRegistrations/{id}         Needs LP
GET    /storage/fileStorage/containerTypeRegistrations              Needs LP
GET    /storage/fileStorage/containerTypeRegistrations/{id}         Needs LP
PATCH  /storage/fileStorage/containerTypeRegistrations/{id}         Needs LP
DELETE /storage/fileStorage/containerTypeRegistrations/{id}         Needs LP

# App Permission Grants (v1.0) — 5 endpoints
PUT    .../applicationPermissionGrants/{appId}                      Needs LP
GET    .../applicationPermissionGrants                              Needs LP
GET    .../applicationPermissionGrants/{appId}                      Needs LP
PATCH  .../applicationPermissionGrants/{appId}                      Needs LP
DELETE .../applicationPermissionGrants/{appId}                      Needs LP

# Containers (v1.0) — 9 endpoints
POST   /storage/fileStorage/containers                              Needs LP
GET    /storage/fileStorage/containers                              Needs LP
GET    /storage/fileStorage/containers/{id}                         Needs LP
PATCH  /storage/fileStorage/containers/{id}                         Needs LP
DELETE /storage/fileStorage/containers/{id}                         Needs LP
POST   /storage/fileStorage/containers/{id}/activate                Needs LP (not yet used)
POST   /storage/fileStorage/containers/{id}/lock                    Needs LP (not yet used)
POST   /storage/fileStorage/containers/{id}/unlock                  Needs LP (not yet used)
POST   /storage/fileStorage/containers/{id}/permanentDelete         Needs LP (not yet used)

# Deleted Containers (v1.0) — 3 endpoints
GET    /storage/fileStorage/deletedContainers                       Needs LP
POST   /storage/fileStorage/deletedContainers/{id}/restore          Needs LP
DELETE /storage/fileStorage/deletedContainers/{id}                  Needs LP

# Container Permissions (v1.0) — 4 endpoints (not yet used)
GET    .../containers/{id}/permissions                              Needs LP
POST   .../containers/{id}/permissions                              Needs LP
PATCH  .../containers/{id}/permissions/{permissionId}               Needs LP
DELETE .../containers/{id}/permissions/{permissionId}               Needs LP

# Container Custom Properties (v1.0) — 4 endpoints (not yet used)
GET    .../containers/{id}/customProperties                         Needs LP
POST   .../containers/{id}/customProperties                         Needs LP
PATCH  .../containers/{id}/customProperties                         Needs LP
DELETE .../containers/{id}/customProperties/{propertyName}          Needs LP

# Container Sub-Resources — 8 endpoints (not yet used)
GET    .../containers/{id}/recycleBin/items                         Needs LP
POST   .../containers/{id}/recycleBin/items/restore                 Needs LP
DELETE .../containers/{id}/recycleBin/items/{itemId}                Needs LP
PATCH  .../containers/{id}/recycleBin/settings                      Needs LP
GET    .../containers/{id}/columns                                  Needs LP
GET    .../containers/{id}/drive                                    Needs LP
POST   .../containers/{id}/migrationJobs                            Needs LP
POST   .../containers/{id}/provisionMigrationContainers             Needs LP
```
