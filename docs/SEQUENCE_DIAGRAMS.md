# Sequence Diagrams for SPE VS Code Extension

## Overview

Two sequence diagrams for the SharePoint Embedded VS Code Extension main operations:
1. **Trial Container Type Setup** (no billing)
2. **Standard Container Type Setup** (with billing)

**Actors:**
- User
- SPE 1P App (VS Code Extension - public client, appId: `63c00075-8c18-4247-b85d-0296f2b0f339`)
- Entra ID
- Microsoft Graph

> **Authentication Model:** All Microsoft Graph and ARM calls in these diagrams are **delegated** (on behalf of the signed-in user). The SPE 1P app is a **public client** — it does not use app-only permissions. Scopes are pre-authorized on the 1P app registration, so no admin consent prompt is required at sign-in.

---

## Diagram 1: Trial Container Type Setup (No Billing)

```
title SPE VS Code Extension - Trial Container Type Creation & Registration

actor User

note over SPE,Graph: All Graph API calls are delegated\n(on behalf of signed-in user).\nSPE 1P App is a public client.

User->SPE: Open Extension & Sign In
SPE->EntraID: VS Code Auth API with SPE 1P appID (public client)
User->EntraID: Sign in
EntraID-->SPE: Auth tokens (delegated)
note over SPE,EntraID: Pre-authorized delegated scopes:\nApplication.ReadWrite.All,\nFileStorageContainerType.Manage.All,\nFileStorageContainerTypeReg.Manage.All,\nFileStorageContainer.Selected,\nUser.Read

User->SPE: Create Trial Container Type

group Owning Application Creation [Scope: Application.ReadWrite.All]
SPE->Graph: POST /applications\n{displayName: "MyApp"}
Graph-->SPE: Application {id, appId}
SPE->Graph: GET /applications(appId='{appId}')\n(wait for propagation)
Graph-->SPE: Application confirmed
SPE->Graph: PATCH /applications/{id}\n{identifierUris: ["api://{appId}"]}
Graph-->SPE: Application updated
end

group Trial Container Type Creation [Scope: FileStorageContainerType.Manage.All]
SPE->Graph: POST /storage/fileStorage/containerTypes\n{name, owningAppId, billingClassification: "trial"}
Graph-->SPE: ContainerType {id, name, owningAppId}
end

User->SPE: Register on Local Tenant

group Container Type Registration [Scope: FileStorageContainerTypeReg.Manage.All]
SPE->Graph: PUT /storage/fileStorage/containerTypeRegistrations/{containerTypeId}\n{\n  "applicationPermissionGrants": [\n    {\n      "appId": "{owningAppId}",\n      "delegatedPermissions": ["readContent", "writeContent"],\n      "applicationPermissions": ["full"]\n    }\n  ]\n}
Graph-->SPE: ContainerTypeRegistration created
end

SPE->User: Success! Container Type registered

group Container Operations [Scope: FileStorageContainer.Selected]
User->SPE: Container operations (Create, Delete, etc.)
SPE->Graph: /storage/fileStorage/containers/*
Graph-->SPE: Container operation results
SPE-->User: Operation complete
end
```

---

## Diagram 2: Standard Container Type Setup (With Billing)

> **Note:** Standard container type creation is not fully implemented in the current codebase (CreateStandardContainerType.ts returns undefined). This diagram is based on the commented-out code and expected flow.

```
title SPE VS Code Extension - Standard Container Type Creation with Billing

actor User

note over SPE,Graph: All Graph/ARM API calls are delegated\n(on behalf of signed-in user).\nSPE 1P App is a public client.

User->SPE: Open Extension & Sign In
SPE->EntraID: VS Code Auth API with SPE 1P appID (public client)
User->EntraID: Sign in
EntraID-->SPE: Auth tokens (delegated)
note over SPE,EntraID: Pre-authorized delegated scopes:\nGraph: Application.ReadWrite.All,\nFileStorageContainerType.Manage.All,\nFileStorageContainerTypeReg.Manage.All,\nFileStorageContainer.Selected,\nUser.Read\nARM: management.azure.com/user_impersonation

User->SPE: Create Standard Container Type
User->SPE: Provide: Azure Subscription ID,\nResource Group, Region

group Owning Application Creation [Scope: Application.ReadWrite.All]
SPE->Graph: POST /applications\n{displayName: "MyApp"}
Graph-->SPE: Application {id, appId}
SPE->Graph: GET /applications(appId='{appId}')\n(wait for propagation)
Graph-->SPE: Application confirmed
SPE->Graph: PATCH /applications/{id}\n{identifierUris: ["api://{appId}"]}
Graph-->SPE: Application updated
end

group Standard Container Type Creation [Scope: FileStorageContainerType.Manage.All]
SPE->Graph: POST /storage/fileStorage/containerTypes\n{name, owningAppId, billingClassification: "standard"}
Graph-->SPE: ContainerType {id, name, owningAppId}
end

group Azure Syntex Provider Registration [Scope: ARM user_impersonation]
SPE->ARM: PUT /subscriptions/{subId}/providers/Microsoft.Syntex/register
ARM-->SPE: Registration initiated
loop Poll until registered (up to 5 min)
SPE->ARM: GET /subscriptions/{subId}/providers/Microsoft.Syntex
ARM-->SPE: registrationState
end
ARM-->SPE: registrationState: "Registered"
end

group Billing Setup [Scope: ARM user_impersonation]
SPE->ARM: PUT /subscriptions/{subId}/resourceGroups/{rg}/providers/Microsoft.Syntex/accounts/{containerTypeId}
ARM-->SPE: provisioningState: "Succeeded"
end

User->SPE: Register on Local Tenant

group Container Type Registration [Scope: FileStorageContainerTypeReg.Manage.All]
SPE->Graph: PUT /storage/fileStorage/containerTypeRegistrations/{containerTypeId}\n{\n  "applicationPermissionGrants": [\n    {\n      "appId": "{owningAppId}",\n      "delegatedPermissions": ["readContent", "writeContent"],\n      "applicationPermissions": ["full"]\n    }\n  ]\n}
Graph-->SPE: ContainerTypeRegistration created
end

SPE->User: Success! Container Type registered with billing

group Container Operations [Scope: FileStorageContainer.Selected]
User->SPE: Container operations (Create, Delete, etc.)
SPE->Graph: /storage/fileStorage/containers/*
Graph-->SPE: Container operation results
SPE-->User: Operation complete
end
```

---

## Key Code References

| Operation | File | Line Numbers |
|-----------|------|--------------|
| SPE 1P App ID | `src/client.ts` | 7 |
| Graph Scopes | `src/services/Auth/GraphAuthProvider.ts` | 14-21 |
| ARM Scopes | `src/services/Auth/ARMAuthProvider.ts` | 14-16 |
| Create App | `src/commands/Apps/GetOrCreateApp.ts` | 145-180 |
| Create Trial CT | `src/commands/ContainerTypes/CreateTrialContainerType.ts` | 78-101 |
| Create Standard CT (stub) | `src/commands/ContainerTypes/CreateStandardContainerType.ts` | 27-208 |
| Register on Tenant | `src/commands/ContainerType/RegisterOnLocalTenant.ts` | 48-115 |
| Registration API | `src/services/Graph/ContainerTypeRegistrationService.ts` | 78-105 |

---

## Scopes Summary

### SPE 1P App (Public Client) - Pre-Authorized Delegated Scopes

**Microsoft Graph (delegated):**
- `Application.ReadWrite.All` - Create/manage Entra ID applications (3P owning apps)
- `FileStorageContainerType.Manage.All` - Create/manage container types
- `FileStorageContainerTypeReg.Manage.All` - Register container types on tenant
- `FileStorageContainer.Selected` - Container operations (create, list, update, delete, recycle, restore, permissions)
- `User.Read` - Read user profile

**Azure Resource Manager (delegated, Standard only):**
- `https://management.azure.com/user_impersonation` - Azure subscription management

### Security Considerations

**All calls are delegated**: The SPE 1P app is a public client and all API calls are made on behalf of the signed-in user (delegated permissions). There are no app-only calls. This means actions are constrained to what the signed-in user has permission to do.

**Scope breadth: `Application.ReadWrite.All`** is broad — it allows the extension to create, read, update, and delete any application registration in the tenant's Entra ID directory. This scope is necessary because the extension must programmatically create 3P owning applications for container types, configure their properties, and create service principals. The risk is mitigated by the delegated permission model (actions performed as the signed-in user, not the application itself) and the requirement that the user has sufficient privileges.

---

## Implementation Notes

1. **Syntax**: Both diagrams use [sequencediagram.org](https://sequencediagram.org) syntax - copy/paste directly
2. **Public client**: SPE 1P App is a public client — all auth is delegated, no client secrets
3. **Pre-authorization**: All scopes are pre-authorized on the 1P app registration — no admin consent prompt at sign-in
4. **Standard diagram**: Includes ARM as additional participant (required for billing)
6. **Trial is fully implemented**: Based on working code in `CreateTrialContainerType.ts`
7. **Standard is theoretical**: Based on commented-out code — billing flow not yet functional

## How to Use

1. Go to https://sequencediagram.org
2. Copy the content between the triple backticks (` ``` `)
3. Paste into the editor
4. The diagram will render automatically
