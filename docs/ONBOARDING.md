# Onboarding Guide: SharePoint Embedded VS Code Extension

Welcome to the team! This guide will get you up to speed on the codebase, the architecture, and your first task: getting container operations working with the new service architecture.

---

## Table of Contents

1. [Introduction & Context](#1-introduction--context)
2. [VS Code Extension API Primer](#2-vs-code-extension-api-primer)
3. [Development Setup & Workflow](#3-development-setup--workflow)
4. [Git Workflow & Branch Strategy](#4-git-workflow--branch-strategy)
5. [Architecture Overview](#5-architecture-overview)
6. [Extension Lifecycle](#6-extension-lifecycle)
7. [Authentication Architecture](#7-authentication-architecture)
8. [Service Layer (New Architecture)](#8-service-layer-new-architecture)
9. [Schema Models (Zod)](#9-schema-models-zod)
10. [Commands — How They Work](#10-commands--how-they-work)
11. [Tree Views — How the UI Works](#11-tree-views--how-the-ui-works)
12. [The Refactor — What's Done and What's Left](#12-the-refactor--whats-done-and-whats-left)
13. [Your Task: Container Operations](#13-your-task-container-operations)
14. [Patterns & Conventions](#14-patterns--conventions)
15. [Key File Reference](#15-key-file-reference)
16. [Glossary](#16-glossary)

---

## 1. Introduction & Context

### What is SharePoint Embedded?

SharePoint Embedded (SPE) is a Microsoft 365 platform that lets ISVs and enterprise developers build file and document management applications powered by SharePoint's storage infrastructure — without needing a SharePoint site. Your app gets enterprise-grade storage, collaboration, compliance, and security features via Microsoft Graph APIs.

The core concepts:
- **Container Types** define the "template" for storage containers. Your tenant admin creates them.
- **Containers** are the actual storage instances (think: folders with permissions, versioning, compliance). Containers belong to a Container Type.
- **Owning Apps** are the Entra ID (Azure AD) application registrations that own a Container Type.
- **Guest Apps** are additional app registrations granted permission to access a Container Type's containers.

### What does this VS Code Extension do?

This extension provides a developer tool for managing SharePoint Embedded resources directly from VS Code. Developers use it to:
- Create and manage Container Types (trial and paid)
- Register Container Types on tenants
- Create, rename, recycle, restore, and delete Containers
- Manage application registrations (owning apps, guest apps, credentials)
- Export Postman configurations for API testing
- Manage permissions and discoverability settings

### The Refactor in Progress

The codebase is undergoing an architecture refactor. The old architecture had a monolithic provider pattern where class-based models (with methods) handled both data and API calls. The new architecture separates concerns into:
- **Schema models** (pure data, Zod-validated)
- **Services** (business logic, API calls)
- **Commands** (thin UI wrappers)

The refactor is being done incrementally — some parts of the codebase use the new architecture, some still use the old. Your job is to migrate the container operations to the new architecture.

---

## 2. VS Code Extension API Primer

Since you may not have worked with VS Code extensions before, here's what you need to know.

### What is a VS Code Extension?

A VS Code extension is a Node.js program that runs inside VS Code's **Extension Host** process. It's a separate process from the VS Code UI — your extension can register commands, contribute UI elements, and interact with the editor, but it runs in isolation.

Key concepts:
- **Activation**: Your extension is loaded (activated) when VS Code starts, based on activation events in `package.json`. Our extension activates on startup (`*`).
- **Deactivation**: Cleanup runs when VS Code closes or the extension is disabled.
- **Extension Context**: A `vscode.ExtensionContext` object passed to your `activate()` function. Used to register disposables (things that need cleanup).

### `package.json` — The Extension Manifest

`package.json` is more than just npm config for a VS Code extension. It's the **manifest** that tells VS Code what your extension contributes:

- **`contributes.commands`**: Declares commands the extension provides (e.g., `spe.Containers.create`). These show up in the Command Palette.
- **`contributes.menus`**: Defines where commands appear in context menus and the UI. Uses `when` clauses to conditionally show/hide items.
- **`contributes.views`**: Declares tree views in the sidebar (our extension has `spe-accounts` and `spe-development`).
- **`contributes.viewsContainers`**: Declares the activity bar icon and sidebar container.
- **`activationEvents`**: When to load the extension (we use `*` for immediate activation).

### Key VS Code APIs We Use

| API | What it does | Where we use it |
|-----|-------------|-----------------|
| `vscode.commands.registerCommand()` | Register a command handler | `Command.register()` base class |
| `vscode.window.showInputBox()` | Prompt user for text input | Commands that need user input (names, descriptions) |
| `vscode.window.showInformationMessage()` | Show info/confirmation dialogs | Confirmation before destructive actions |
| `vscode.window.showErrorMessage()` | Show error notifications | Error handling in commands |
| `vscode.window.withProgress()` | Show progress notifications | `ProgressWaitNotification` wrapper |
| `vscode.authentication.getSession()` | Get/create auth sessions | `VSCodeAuthProvider` |
| `vscode.commands.executeCommand('setContext', ...)` | Set context keys for `when` clauses | `AuthenticationState` (sets `spe:isLoggedIn`, etc.) |
| `vscode.window.registerTreeDataProvider()` | Register a tree view | `extension.ts` activation |

### TreeDataProvider and TreeItem

The sidebar UI is built using VS Code's tree view API:

- **`TreeDataProvider`**: An interface your class implements to provide data for a tree view. You implement:
  - `getChildren(element?)`: Returns child items (root items if no parent given).
  - `getTreeItem(element)`: Returns the visual representation of an item.
  - `onDidChangeTreeData`: An event you fire to tell VS Code to refresh the tree.

- **`TreeItem`**: Represents a single item in the tree. Has properties like `label`, `collapsibleState`, `contextValue`, `iconPath`, and `command` (click handler).

### Context Keys and `when` Clauses

VS Code uses a system of context keys to control when UI elements are visible:

```json
// In package.json menus section:
{
  "command": "spe.Container.recycle",
  "when": "viewItem =~ /spe:containerTreeItem/",
  "group": "spe-container-danger@1"
}
```

- `viewItem` is a built-in context key that matches the `contextValue` property of a tree item.
- The extension sets custom context keys like `spe:isLoggedIn` and `spe:isAdmin` via `vscode.commands.executeCommand('setContext', key, value)`.
- `when` clauses use these keys to conditionally show/hide commands in menus.

### Extension Development Host

When you press **F5** to debug, VS Code launches a **second VS Code window** called the Extension Development Host. This window has your extension loaded and running. You can:
- Set breakpoints in your TypeScript source code (sourcemaps are enabled)
- See your extension's tree views, commands, and menus
- Test the full user experience

The original VS Code window shows the Debug Console with your `console.log` output.

### Output Channel

The extension creates a dedicated output channel called **"SharePoint Embedded"**. To see it:
1. Open the Output panel (`Ctrl+Shift+U` or `View > Output`)
2. Select "SharePoint Embedded" from the dropdown

All `console.log` and `console.error` calls from the extension appear here.

---

## 3. Development Setup & Workflow

### Prerequisites

- **Node.js** (LTS version, 18+)
- **npm** (comes with Node.js)
- **VS Code** (latest stable)
- **A Microsoft 365 tenant with SPE admin access** (for testing)

### First-Time Setup

1. **Clone the repo and switch to the refactor branch:**
   ```bash
   git clone https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension.git
   cd SharePoint-Embedded-VS-Code-Extension
   git checkout auth-refactor-alex
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Compile the TypeScript:**
   ```bash
   npm run compile
   ```
   Or start watch mode for auto-recompilation:
   ```bash
   npm run watch
   ```

4. **Open the project in VS Code:**
   ```bash
   code .
   ```

5. **Press F5** to launch the Extension Development Host.
   - This opens a **second VS Code window** with the extension loaded.
   - The SharePoint Embedded icon appears in the activity bar (left sidebar).
   - Sign in with an SPE admin account to see the Development tree view.

### How to Debug

1. Set breakpoints in any `.ts` file by clicking the gutter (left of line numbers).
2. Press **F5** (or use the "Run Extension" launch configuration).
3. In the Extension Development Host, trigger the code you want to debug.
4. Execution pauses at your breakpoints in the original VS Code window.
5. Use the Debug Console for `console.log` output and the Variables pane to inspect state.

The launch configurations are in `.vscode/launch.json`:
- **"Run Extension"**: Launches the Extension Development Host for manual testing.
- **"Extension Tests"**: Runs the automated test suite.

### Watch Mode

Run `npm run watch` in a terminal. TypeScript files are automatically recompiled on save. After a change:
1. Save your file (auto-compiles via watch mode).
2. In the Extension Development Host, press `Ctrl+Shift+P` and run **"Developer: Reload Window"** to pick up the new code.

Alternatively, stop and restart the debug session (Shift+F5, then F5).

### Viewing Logs

1. In the Extension Development Host, open the Output panel (`Ctrl+Shift+U`).
2. Select **"SharePoint Embedded"** from the dropdown.
3. Service methods log with `[ServiceName.methodName]` prefixes, making it easy to trace operations.

### Running Tests and Lint

```bash
# Run all tests
npm test

# Lint TypeScript files
npm run lint

# Both (pretest runs compile + lint)
npm run pretest
```

---

## 4. Git Workflow & Branch Strategy

### Branch Structure

```
main                          ← stable release branch (don't target PRs here)
  └── auth-refactor-alex      ← the refactor branch (our base)
        └── auth-refactor-alex-containers   ← your feature branch
        └── auth-refactor-alex-<other>      ← other feature branches
```

### Your Workflow

1. **Create your feature branch off `auth-refactor-alex`:**
   ```bash
   git checkout auth-refactor-alex
   git pull origin auth-refactor-alex
   git checkout -b auth-refactor-alex-containers
   ```

2. **Do your work, commit regularly.**

3. **Submit PRs into `auth-refactor-alex`** (not `main`).

4. **Stay in sync** — pull from `auth-refactor-alex` regularly:
   ```bash
   git checkout auth-refactor-alex
   git pull origin auth-refactor-alex
   git checkout auth-refactor-alex-containers
   git merge auth-refactor-alex
   ```

### Areas That Are Safe to Work On

**Go ahead** (your focus areas):
- `src/commands/Container/` — container operation commands
- `src/commands/Containers/` — container creation command
- `src/commands/RecycledContainer/` — recycled container commands
- `src/services/Graph/ContainerService.ts` — the new service you'll create
- `src/views/treeview/development/ContainerTreeItem.ts` — updating tree items
- `src/views/treeview/development/ContainersTreeItem.ts` — updating container list tree item

**Avoid modifying** (unless discussed first):
- `src/services/Auth/` — authentication providers
- `src/services/AuthenticationState.ts` — auth state management
- `src/commands/ContainerType/RegisterOnLocalTenant.ts` — recently migrated, don't touch
- `src/commands/ContainerTypes/CreateTrialContainerType.ts` — reference implementation, don't change
- `src/views/treeview/development/DevelopmentTreeViewProvider.ts` — main tree view orchestrator
- `src/services/Graph/GraphProvider.ts` — you'll add one property here, but don't change existing code

---

## 5. Architecture Overview

### The Layer Stack

```
┌─────────────────────────────────────────────┐
│              Commands (UI Actions)           │  src/commands/
│  Thin wrappers: auth check → input →        │
│  service call → error handling → UI update   │
├─────────────────────────────────────────────┤
│           Services (Business Logic)          │  src/services/Graph/
│  API calls, validation, error handling       │
│  e.g., ApplicationService, ContainerType-   │
│  Service, (your) ContainerService            │
├─────────────────────────────────────────────┤
│        Schema Models (Type-Safe Data)        │  src/models/schemas/
│  Zod schemas for runtime validation          │
│  Pure data types, no methods                 │
├─────────────────────────────────────────────┤
│              APIs (External)                 │
│  Microsoft Graph API, SharePoint Admin API   │
│  Azure Resource Manager API                  │
└─────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── extension.ts                    # Entry point: activate() and deactivate()
├── client.ts                       # Client IDs and telemetry keys
├── commands/                       # All user-facing commands
│   ├── Command.ts                  # Abstract base class for all commands
│   ├── index.ts                    # Barrel export as Commands namespace
│   ├── Accounts/                   # SignIn, SignOut, CancelSignIn
│   ├── App/                        # App operations (rename, credentials, Postman)
│   ├── Apps/                       # App creation (GetOrCreateApp)
│   ├── Container/                  # YOUR FOCUS: container operations
│   │   ├── RenameContainer.ts
│   │   ├── EditContainerDescription.ts
│   │   ├── RecycleContainer.ts
│   │   ├── CopyContainerId.ts
│   │   └── ViewContainerProperties.ts
│   ├── Containers/                 # YOUR FOCUS: container creation
│   │   └── CreateContainer.ts
│   ├── ContainerType/              # Container type operations
│   ├── ContainerTypes/             # Container type creation
│   ├── GuestApps/                  # Guest app permissions
│   └── RecycledContainer/          # YOUR FOCUS: recycled container operations
│       ├── DeleteContainer.ts
│       ├── RestoreContainer.ts
│       └── CopyContainerId.ts
├── services/
│   ├── Auth/                       # Authentication providers
│   │   ├── VSCodeAuthProvider.ts   # Base: wraps VS Code's auth API
│   │   ├── GraphAuthProvider.ts    # Graph-specific auth (extends VSCodeAuthProvider)
│   │   └── ARMAuthProvider.ts      # Azure Resource Manager auth
│   ├── Graph/                      # NEW: Graph API service layer
│   │   ├── GraphProvider.ts        # Singleton hub — access point for all services
│   │   ├── ApplicationService.ts   # REFERENCE: Application CRUD & credentials
│   │   ├── ContainerTypeService.ts # Container type management
│   │   ├── ContainerTypeRegistrationService.ts
│   │   └── ContainerTypeAppPermissionGrantService.ts
│   ├── AuthenticationState.ts      # Centralized auth state singleton
│   ├── GraphProvider.ts            # OLD LEGACY provider (being replaced)
│   ├── StorageProvider.ts          # VS Code storage abstraction
│   └── TelemetryProvider.ts        # Application Insights telemetry
├── models/
│   ├── schemas/                    # NEW: Zod schema models
│   │   ├── index.ts                # Barrel exports
│   │   ├── application.ts          # Application schema
│   │   ├── containerType.ts        # Container type schema
│   │   ├── container.ts            # Container schema (already exists!)
│   │   ├── containerTypeRegistration.ts
│   │   ├── containerTypeAppPermissionGrant.ts
│   │   └── shared.ts               # Shared schemas (BillingClassification, etc.)
│   ├── App.ts                      # OLD: class-based App model
│   ├── Container.ts                # OLD: class-based Container model
│   ├── ContainerType.ts            # OLD: class-based ContainerType model
│   └── telemetry/                  # Telemetry event definitions
├── views/
│   ├── treeview/development/       # Development sidebar tree view
│   │   ├── DevelopmentTreeViewProvider.ts   # Main tree data provider
│   │   ├── ContainerTypesTreeItem.ts        # Root "Container Types" node
│   │   ├── ContainerTypeTreeItem.ts         # Individual container type
│   │   ├── OwningAppTreeItem.ts             # Owning app under a CT
│   │   ├── LocalRegistrationTreeItem.ts     # Registration info
│   │   ├── ContainersTreeItem.ts            # YOUR FOCUS: "Containers" folder
│   │   ├── ContainerTreeItem.ts             # YOUR FOCUS: individual container
│   │   ├── RecycledContainersTreeItem.ts    # Recycled containers folder
│   │   ├── RecycledContainerTreeItem.ts     # Individual recycled container
│   │   ├── GuestAppTreeItem.ts              # Guest app
│   │   └── IDataProvidingTreeItem.ts        # Base class for tree items with children
│   └── notifications/
│       └── ProgressWaitNotification.ts      # Progress notification wrapper
└── utils/
    ├── extensionVariables.ts       # Global extension state (ext singleton)
    ├── token.ts                    # JWT decoding/validation
    └── constants.ts                # Application constants
```

### New vs. Legacy Architecture

| Aspect | New Architecture | Legacy Architecture |
|--------|-----------------|-------------------|
| **Data models** | Zod schemas in `models/schemas/` — pure data, no methods | Class-based models in `models/` — classes with methods that call APIs |
| **API calls** | Service classes in `services/Graph/` | Provider classes (`GraphProvider`, `SPAdminProvider`) embedded in models |
| **Auth** | `VSCodeAuthProvider` → `GraphAuthProvider` (VS Code native auth) | `BaseAuthProvider` → MSAL + PKCE (custom OAuth flow) |
| **Service access** | `GraphProvider.getInstance()` singleton hub | `Account.get().appProvider`, `Account.get().containerTypeProvider` |
| **Type safety** | Runtime-validated with Zod | TypeScript types only (no runtime checks) |

### Key Singletons

| Singleton | Access | Purpose |
|-----------|--------|---------|
| `GraphProvider` | `GraphProvider.getInstance()` | Hub for all Graph API services |
| `AuthenticationState` | Static methods (e.g., `AuthenticationState.isSignedIn()`) | Manages sign-in state, account info |
| `DevelopmentTreeViewProvider` | `DevelopmentTreeViewProvider.getInstance()` | The sidebar tree view — call `.refresh()` after mutations |
| `StorageProvider` | Static methods (e.g., `StorageProvider.storeSecret()`) | Persistent storage for secrets, state |

---

## 6. Extension Lifecycle

### Activation Flow (`extension.ts`)

When VS Code loads the extension, `activate()` runs:

```
1. Set global extension context (ext.context, ext.outputChannel)
2. Register TelemetryProvider
3. Initialize StorageProvider (global state, workspace state, secrets)
4. Purge old cache entries
5. Register tree data providers:
   - AccountTreeViewProvider → "spe-accounts" view
   - DevelopmentTreeViewProvider → "spe-development" view
6. Subscribe to AuthenticationState changes:
   - onSignIn → refresh DevelopmentTreeViewProvider
   - onSignOut → refresh DevelopmentTreeViewProvider
7. Initialize AuthenticationState (check if already signed in)
8. Register all commands (50+ commands via Commands.*.register(context))
```

### How Commands Are Registered

Every command follows the `Command` base class pattern:

```typescript
// src/commands/Command.ts
export abstract class Command {
    public static readonly COMMAND: string;  // e.g., 'Containers.create'

    public static register(context: vscode.ExtensionContext): void {
        const commandName = `spe.${this.COMMAND}`;  // becomes 'spe.Containers.create'
        const command = vscode.commands.registerCommand(commandName, this.run);
        context.subscriptions.push(command);
    }

    public static async run(): Promise<any> {
        throw new Error('Not implemented.');
    }
}
```

In `extension.ts`, each command is registered:
```typescript
Commands.CreateContainer.register(context);
Commands.RenameContainer.register(context);
// etc.
```

The command string `spe.Containers.create` must also be declared in `package.json` under `contributes.commands` for it to appear in the Command Palette and menus.

### How Tree Views Refresh

After any mutation (create, rename, delete, etc.), commands call:
```typescript
DevelopmentTreeViewProvider.getInstance().refresh();
```

This fires the `onDidChangeTreeData` event, which tells VS Code to re-call `getChildren()` on the tree, rebuilding the entire tree from the API.

### Auth State → UI Updates (Observer Pattern)

```
User clicks "Sign In"
  → AuthenticationState.signIn()
    → GraphAuthProvider.signIn()
    → Decode JWT, check admin claim
    → Set context keys (spe:isLoggedIn, spe:isAdmin)
    → Notify all listeners
      → DevelopmentTreeViewProvider.refresh()
        → Tree rebuilds, queries GraphProvider.containerTypes.list()
```

---

## 7. Authentication Architecture

### How Sign-In Works

This extension uses **VS Code's built-in Microsoft authentication provider** rather than implementing OAuth directly. The flow:

1. User clicks "Sign In" → `AuthenticationState.signIn()` is called.
2. `GraphAuthProvider.signIn()` calls `vscode.authentication.getSession()` with `createIfNone: true`.
3. VS Code opens a browser tab or inline dialog for Microsoft login.
4. After login, VS Code returns an `AuthenticationSession` with an `accessToken`.
5. The JWT access token is decoded to extract:
   - `tid` (tenant ID)
   - `name` (display name)
   - `wids` (directory role IDs — used to check admin status)
6. `AuthenticationState` stores the account info and notifies listeners.
7. Context keys are set: `spe:isLoggedIn = true`, `spe:isAdmin = true/false`.

### Auth Provider Hierarchy

```
VSCodeAuthProvider                 (base — configurable client ID + scopes)
  └── GraphAuthProvider            (Microsoft Graph scopes pre-configured)
```

**`VSCodeAuthProvider`** (`src/services/Auth/VSCodeAuthProvider.ts`):
- Wraps `vscode.authentication.getSession()` with VS Code-specific scope prefixes.
- Supports `VSCODE_CLIENT_ID:` and `VSCODE_TENANT:` scope prefixes that VS Code's Microsoft auth provider uses internally.
- Provides `getAuthHandler()` that returns a callback compatible with the Microsoft Graph SDK.

**`GraphAuthProvider`** (`src/services/Auth/GraphAuthProvider.ts`):
- Extends `VSCodeAuthProvider` with pre-configured Graph scopes:
  - `Application.ReadWrite.All`
  - `FileStorageContainer.Manage.All`
  - `FileStorageContainer.Selected`
  - `FileStorageContainerType.Manage.All`
  - `FileStorageContainerTypeReg.Manage.All`
  - `User.Read`
- Singleton pattern — `GraphAuthProvider.getInstance()`.

### How Tokens Flow to the Graph SDK

```
GraphProvider.getInstance()
  → new GraphProvider(GraphAuthProvider.getInstance())
    → Graph.Client.init({ authProvider: graphAuth.getAuthHandler() })
```

The `getAuthHandler()` method returns a callback that VS Code calls every time the Graph SDK needs a token. It silently retrieves a cached token or prompts for re-auth if needed.

### Admin Detection

Admin status is determined by checking the JWT's `wids` claim for known admin role IDs (Global Admin, SharePoint Admin). See `src/utils/token.ts` → `checkJwtForAdminClaim()`.

### Important: Delegated Auth

All API calls are made **on behalf of the signed-in user** (delegated permissions). The 1P client app is a public client — there are no app secrets stored for the extension itself. The legacy container commands use a different pattern (app-only auth with `AppOnly3PAuthProvider`), which is part of what needs to change in the migration.

---

## 8. Service Layer (New Architecture)

### GraphProvider — The Service Hub

`GraphProvider` (`src/services/Graph/GraphProvider.ts`) is a singleton that provides access to all Graph API services:

```typescript
const graphProvider = GraphProvider.getInstance();

// Access services:
graphProvider.applications    // → ApplicationService
graphProvider.containerTypes  // → ContainerTypeService
graphProvider.registrations   // → ContainerTypeRegistrationService
graphProvider.appPermissionGrants // → ContainerTypeAppPermissionGrantService
// graphProvider.containers   // → ContainerService (you'll add this!)
```

It initializes the Graph SDK client with `GraphAuthProvider` for authentication, then passes the client to each service.

### How Services Are Structured

Use `ApplicationService` (`src/services/Graph/ApplicationService.ts`) as your reference. Every service follows this pattern:

```typescript
import * as Graph from '@microsoft/microsoft-graph-client';
import { SomeSchema, someSchema, someCreateSchema } from '../../models/schemas';

export class SomeService {
    private static readonly API_VERSION = 'beta'; // or 'v1.0'
    private static readonly BASE_PATH = '/some/api/path';

    constructor(private _client: Graph.Client) {}

    async list(options?: { filter?: string; select?: string[] }): Promise<SomeType[]> {
        try {
            let request = this._client
                .api(SomeService.BASE_PATH)
                .version(SomeService.API_VERSION);

            // Apply options...
            const response = await request.get();

            // Validate response with Zod
            return response.value.map((item: any) => someSchema.parse(item));
        } catch (error: any) {
            console.error('[SomeService.list] Error:', error);
            throw new Error(`Failed to list items: ${error.message || error}`);
        }
    }

    async create(data: SomeCreateType): Promise<SomeType> {
        try {
            const validated = someCreateSchema.parse(data);
            console.log('[SomeService.create] Creating item:', validated);

            const response = await this._client
                .api(SomeService.BASE_PATH)
                .version(SomeService.API_VERSION)
                .post(validated);

            return someSchema.parse(response);
        } catch (error: any) {
            console.error('[SomeService.create] Error:', error);
            throw new Error(`Failed to create item: ${error.message || error}`);
        }
    }
}
```

Key patterns:
1. **Constructor takes `Graph.Client`** — injected by `GraphProvider`.
2. **Static constants** for API version and base path.
3. **Input validation** with Zod `parse()` on request data.
4. **Response validation** with Zod `parse()` on API responses.
5. **Structured logging** with `[ServiceName.methodName]` prefix.
6. **Error handling** with try/catch, `console.error`, and descriptive `throw new Error()`.

### Available Services

| Service | Property on GraphProvider | API Base | Version |
|---------|--------------------------|----------|---------|
| `ApplicationService` | `.applications` | `/applications` | `v1.0` |
| `ContainerTypeService` | `.containerTypes` | `/storage/fileStorage/containerTypes` | `beta` |
| `ContainerTypeRegistrationService` | `.registrations` | `.../containerTypes/{id}/...` | `beta` |
| `ContainerTypeAppPermissionGrantService` | `.appPermissionGrants` | `.../appPermissionGrants` | `beta` |
| **`ContainerService`** (your task!) | **`.containers`** | **`/storage/fileStorage/containers`** | **`beta`** |

---

## 9. Schema Models (Zod)

### Why Zod?

[Zod](https://zod.dev/) gives us:
- **Runtime validation**: API responses are validated at runtime, not just compile time. If the Graph API returns an unexpected shape, Zod throws an error immediately instead of causing a cryptic crash later.
- **TypeScript type inference**: `z.infer<typeof schema>` generates the TypeScript type automatically, so you don't maintain types separately from validation logic.

### Key Patterns

```typescript
import { z } from 'zod';

// .optional() — field may not be present in the object
displayName: z.string().optional()

// .nullish() — field may not be present OR may be null
// Use this for Graph API fields that can be null
description: z.string().nullish()

// .pick() — create a subset schema
const nameOnly = fullSchema.pick({ displayName: true });

// .partial() — make all fields optional (useful for update schemas)
const updateSchema = fullSchema.partial();

// .extend() — add fields to an existing schema
const extendedSchema = baseSchema.extend({ newField: z.string() });
```

### Schema File Structure

Each schema file follows this pattern (see `src/models/schemas/container.ts`):

```typescript
// 1. Import Zod
import { z } from 'zod';

// 2. Define enum schemas for constrained values
export const containerStatusSchema = z.enum(['inactive', 'active', 'unknownFutureValue']);

// 3. Define the main resource schema (full API response)
export const containerSchema = baseResourceSchema.extend({
    id: z.string(),
    displayName: z.string(),
    description: z.string().optional(),
    // ...
});

// 4. Define create schema (only writable fields, required fields non-optional)
export const containerCreateSchema = z.object({
    displayName: z.string().min(1).max(256),
    containerTypeId: guidSchema,
    // ...
});

// 5. Define update schema (writable fields, all optional)
export const containerUpdateSchema = z.object({
    displayName: z.string().min(1).max(256).optional(),
    description: z.string().max(1024).optional(),
    // ...
});

// 6. Export inferred TypeScript types
export type Container = z.infer<typeof containerSchema>;
export type ContainerCreate = z.infer<typeof containerCreateSchema>;
export type ContainerUpdate = z.infer<typeof containerUpdateSchema>;
```

### The Container Schema Already Exists

Good news — the container schema is already defined at `src/models/schemas/container.ts`. It includes:
- `containerSchema` — full container resource
- `containerCreateSchema` — for `POST /containers`
- `containerUpdateSchema` — for `PATCH /containers/{id}`
- `deletedContainerSchema` — container with `deletedDateTime`
- Permission and custom property schemas

All types are exported from `src/models/schemas/index.ts`.

---

## 10. Commands — How They Work

### The Command Base Class

All commands extend `Command` (`src/commands/Command.ts`):

```typescript
export abstract class Command {
    public static readonly COMMAND: string;  // e.g., 'Container.rename'

    public static register(context: vscode.ExtensionContext): void {
        const commandName = `spe.${this.COMMAND}`;
        const command = vscode.commands.registerCommand(commandName, this.run);
        context.subscriptions.push(command);
    }

    public static async run(): Promise<any> {
        throw new Error('Not implemented.');
    }
}
```

Every concrete command overrides `COMMAND` and `run()`.

### End-to-End Wiring of a Command

To have a working command, four files must be in sync:

1. **Command file** (e.g., `src/commands/Container/RenameContainer.ts`):
   ```typescript
   export class RenameContainer extends Command {
       public static readonly COMMAND = 'Container.rename';
       public static async run(containerViewModel?: ContainerTreeItem): Promise<...> { ... }
   }
   ```

2. **Barrel export** (`src/commands/index.ts`):
   ```typescript
   import { RenameContainer as _RenameContainer } from './Container/RenameContainer';
   export namespace Commands {
       export const RenameContainer = _RenameContainer;
   }
   ```

3. **Registration** (`src/extension.ts`):
   ```typescript
   Commands.RenameContainer.register(context);
   ```

4. **Manifest** (`package.json`):
   ```json
   // In contributes.commands:
   { "command": "spe.Container.rename", "title": "Rename Container" }

   // In contributes.menus.view/item/context:
   {
     "command": "spe.Container.rename",
     "when": "viewItem =~ /spe:containerTreeItem/",
     "group": "spe-container-edit@1"
   }
   ```

### Anatomy of a Migrated Command

Using `CreateTrialContainerType` as the reference (the cleanest example of the new pattern):

```typescript
public static async run(): Promise<ContainerType | undefined> {
    // 1. Auth check
    const isSignedIn = await AuthenticationState.isSignedIn();
    if (!isSignedIn) { /* show error, return */ }

    // 2. Get service hub
    const graphProvider = GraphProvider.getInstance();

    // 3. User input
    const displayName = await vscode.window.showInputBox({ ... });
    if (!displayName) { return; }  // user cancelled

    // 4. Show progress
    const progressWindow = new ProgressWaitNotification('Creating...');
    progressWindow.show();

    // 5. Call service
    try {
        const result = await graphProvider.containerTypes.create({ ... });

        // 6. Refresh tree view
        DevelopmentTreeViewProvider.getInstance().refresh();
        progressWindow.hide();

        // 7. Telemetry (optional)
        TelemetryProvider.instance.send(new SomeEvent());

        return result;
    } catch (error: any) {
        // 8. Error handling
        progressWindow.hide();
        vscode.window.showErrorMessage(`Failed: ${error.message}`);
        return;
    }
}
```

### How Commands Receive Props from Tree Items

When a command is triggered by clicking a tree item's context menu, VS Code passes the tree item as the first argument to `run()`:

```typescript
// The tree item that was right-clicked gets passed automatically
public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
    if (!containerViewModel) { return; }
    const container = containerViewModel.container;  // access the data
}
```

This works because `package.json` menus bind commands to specific `viewItem` context values.

---

## 11. Tree Views — How the UI Works

### The Tree Hierarchy

```
spe-development (tree view)
└── ContainerTypesTreeItem ("Container Types")
    └── ContainerTypeTreeItem (e.g., "My Trial CT")
        ├── OwningAppTreeItem ("Owning App: My App")
        ├── LocalRegistrationTreeItem ("Registration")
        │   ├── ContainersTreeItem ("Containers")        ← YOUR FOCUS
        │   │   ├── ContainerTreeItem ("Container A")    ← YOUR FOCUS
        │   │   └── ContainerTreeItem ("Container B")    ← YOUR FOCUS
        │   └── RecycledContainersTreeItem ("Recycled Containers")
        │       ├── RecycledContainerTreeItem ("Old Container")
        │       └── ...
        └── GuestAppsTreeItem ("Guest Apps")
            └── GuestAppTreeItem ("Guest App X")
```

### TreeDataProvider Interface

`DevelopmentTreeViewProvider` implements `TreeDataProvider`:

```typescript
export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<...> {
    // Event to trigger refresh
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Return visual representation of a tree item
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    // Return children for a tree item (or root items if no parent)
    async getChildren(element?): Promise<vscode.TreeItem[]> {
        if (element instanceof IChildrenProvidingTreeItem) {
            return await element.getChildren();
        }
        return await this._getChildren();  // root level
    }

    // Trigger a refresh
    refresh(element?: vscode.TreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }
}
```

### `IChildrenProvidingTreeItem` Base Class

Tree items that have children extend this abstract class:

```typescript
export abstract class IChildrenProvidingTreeItem extends vscode.TreeItem {
    public abstract getChildren(): Thenable<vscode.TreeItem[]>;
}
```

For example, `ContainersTreeItem` extends it and implements `getChildren()` to load containers from the API.

### `contextValue` Pattern

Each tree item sets a `contextValue` string that controls which context menu items appear:

```typescript
// In ContainerTreeItem:
this.contextValue = "spe:containerTreeItem";

// In package.json menus:
{
    "command": "spe.Container.rename",
    "when": "viewItem =~ /spe:containerTreeItem/"
}
```

Some tree items build dynamic context values with qualifiers:
```
spe:containerTypeTreeItem-trial-registered-discoverabilityEnabled
```

The `when` clause uses regex matching (`=~`) to match against these.

---

## 12. The Refactor — What's Done and What's Left

### Phase 1: Display Layer (Complete)

- New Zod schemas in `models/schemas/`
- New services in `services/Graph/`
- `GraphProvider` singleton hub
- `DevelopmentTreeViewProvider` uses new schemas
- Tree items display using new schema types
- Commands accept both old and new model types (backward compatibility)

### Phase 2: Operations Layer (In Progress)

Fully migrated to new services:
- `CreateTrialContainerType` — creates container types via `graphProvider.containerTypes.create()`
- `RegisterOnLocalTenant` — registers CTs via `graphProvider.registrations.create()`
- `DeleteContainerType` — deletes via `graphProvider.containerTypes.delete()`
- `RenameContainerType` — updates via `graphProvider.containerTypes.update()`
- `EnableContainerTypeDiscoverability` / `DisableContainerTypeDiscoverability`

Still using legacy providers (your migration targets):
- **Container commands**: `CreateContainer`, `RenameContainer`, `EditContainerDescription`, `RecycleContainer`
- **Recycled container commands**: `DeleteContainer`, `RestoreContainer`
- Guest app commands

### What the Legacy Container Commands Look Like

The current container commands use the **old** `GraphProvider` (`src/services/GraphProvider.ts` — note: different from `src/services/Graph/GraphProvider.ts`!). They:

1. Get the `owningApp` from the old class-based `ContainerType` model.
2. Create an `AppOnly3PAuthProvider` (app-only auth with client secret).
3. Instantiate the old `GraphProvider` with that auth provider.
4. Call methods like `graphProvider.createContainer()`, `graphProvider.recycleContainer()`, etc.

This pattern needs to change to use the new `GraphProvider.getInstance()` which uses delegated auth.

---

## 13. Your Task: Container Operations

### Overview

Your job is to:
1. Create a `ContainerService` in `src/services/Graph/ContainerService.ts`
2. Add it to `GraphProvider` as the `.containers` property
3. Migrate all container commands to use the new service
4. Update tree items to use new schema types

### Step 1: Create `ContainerService`

Create `src/services/Graph/ContainerService.ts`. Use `ApplicationService.ts` and `ContainerTypeService.ts` as templates.

The container schema already exists at `src/models/schemas/container.ts` with all the types you need:
- `Container`, `containerSchema` — full container resource
- `ContainerCreate`, `containerCreateSchema` — for creating
- `ContainerUpdate`, `containerUpdateSchema` — for updating
- `DeletedContainer`, `deletedContainerSchema` — for recycled containers

Here are the API endpoints (from the legacy `src/services/GraphProvider.ts`, lines 128-211):

| Method | HTTP | Endpoint | Notes |
|--------|------|----------|-------|
| `list` | GET | `/storage/fileStorage/containers?$filter=containerTypeId eq {id}` | Filter by container type |
| `get` | GET | `/storage/fileStorage/containers/{id}` | Select + expand permissions |
| `create` | POST | `/storage/fileStorage/containers` | Body: `{ displayName, description, containerTypeId }` |
| `update` | PATCH | `/storage/fileStorage/containers/{id}` | Body: `{ displayName, description }` |
| `recycle` | DELETE | `/storage/fileStorage/containers/{id}` | Soft-delete (moves to recycle bin) |
| `listRecycled` | GET | `/storage/fileStorage/deletedContainers?$filter=containerTypeId eq {id}` | List recycled containers |
| `restore` | POST | `/storage/fileStorage/deletedContainers/{id}/restore` | Restore from recycle bin |
| `delete` | DELETE | `/storage/fileStorage/deletedContainers/{id}` | Permanent delete |

All endpoints use **beta** API version.

Here's a skeleton to start with:

```typescript
import * as Graph from '@microsoft/microsoft-graph-client';
import {
    Container,
    ContainerCreate,
    ContainerUpdate,
    DeletedContainer,
    containerSchema,
    containerCreateSchema,
    containerUpdateSchema,
    deletedContainerSchema
} from '../../models/schemas';

export class ContainerService {
    private static readonly API_VERSION = 'beta';
    private static readonly BASE_PATH = '/storage/fileStorage/containers';
    private static readonly DELETED_BASE_PATH = '/storage/fileStorage/deletedContainers';

    constructor(private _client: Graph.Client) {}

    /**
     * List containers for a specific container type
     * GET /storage/fileStorage/containers?$filter=containerTypeId eq {containerTypeId}
     */
    async list(containerTypeId: string, options?: {
        select?: string[];
        top?: number;
    }): Promise<Container[]> {
        // TODO: implement
    }

    /**
     * Get a specific container by ID
     * GET /storage/fileStorage/containers/{id}
     */
    async get(id: string, options?: {
        select?: string[];
        expandPermissions?: boolean;
    }): Promise<Container | null> {
        // TODO: implement
    }

    /**
     * Create a new container
     * POST /storage/fileStorage/containers
     */
    async create(container: ContainerCreate): Promise<Container> {
        // TODO: implement
    }

    /**
     * Update a container
     * PATCH /storage/fileStorage/containers/{id}
     */
    async update(id: string, updates: ContainerUpdate): Promise<Container> {
        // TODO: implement
    }

    /**
     * Recycle (soft-delete) a container
     * DELETE /storage/fileStorage/containers/{id}
     */
    async recycle(id: string): Promise<void> {
        // TODO: implement
    }

    /**
     * List recycled (deleted) containers for a container type
     * GET /storage/fileStorage/deletedContainers?$filter=containerTypeId eq {containerTypeId}
     */
    async listRecycled(containerTypeId: string): Promise<DeletedContainer[]> {
        // TODO: implement
    }

    /**
     * Restore a recycled container
     * POST /storage/fileStorage/deletedContainers/{id}/restore
     */
    async restore(id: string): Promise<Container> {
        // TODO: implement
    }

    /**
     * Permanently delete a recycled container
     * DELETE /storage/fileStorage/deletedContainers/{id}
     */
    async delete(id: string): Promise<void> {
        // TODO: implement
    }
}
```

### Step 2: Add `ContainerService` to `GraphProvider`

In `src/services/Graph/GraphProvider.ts`, add:

```typescript
import { ContainerService } from './ContainerService';

// In the class:
private _containerService: ContainerService;

// In the constructor, after other service initializations:
this._containerService = new ContainerService(this._client);

// Add the getter:
public get containers(): ContainerService {
    return this._containerService;
}
```

### Step 3: Migrate Container Commands

For each command, the migration pattern is:

**Before (legacy)**:
```typescript
// Gets app-only auth provider from the old model
const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
const graphProvider = new GraphProvider(authProvider);
const container = await graphProvider.createContainer(containerTypeRegistration, displayName);
```

**After (new)**:
```typescript
// Uses the singleton GraphProvider with delegated auth
const graphProvider = GraphProvider.getInstance();
const container = await graphProvider.containers.create({
    displayName: containerDisplayName,
    containerTypeId: containerTypeRegistration.containerTypeId
});
```

Here are the specific commands to migrate:

#### `CreateContainer` (`src/commands/Containers/CreateContainer.ts`)

- Currently uses: old `GraphProvider`, `AppOnly3PAuthProvider`, `ContainerTypeRegistration` model
- Change to: `GraphProvider.getInstance().containers.create()`
- Note: The `containersViewModel` parameter provides `containerType` and `containerTypeRegistration` — you'll need the `containerTypeId` from the container type to pass to `create()`.

#### `RenameContainer` (`src/commands/Container/RenameContainer.ts`)

- Currently uses: old `GraphProvider.updateContainer()`
- Change to: `GraphProvider.getInstance().containers.update(id, { displayName: newName })`

#### `EditContainerDescription` (`src/commands/Container/EditContainerDescription.ts`)

- Currently uses: old `GraphProvider.updateContainer()`
- Change to: `GraphProvider.getInstance().containers.update(id, { description: newDescription })`

#### `RecycleContainer` (`src/commands/Container/RecycleContainer.ts`)

- Currently uses: old `GraphProvider.recycleContainer()`
- Change to: `GraphProvider.getInstance().containers.recycle(id)`

#### `RestoreContainer` (`src/commands/RecycledContainer/RestoreContainer.ts`)

- Currently uses: old `GraphProvider.restoreContainer()`
- Change to: `GraphProvider.getInstance().containers.restore(id)`

#### `DeleteContainer` (`src/commands/RecycledContainer/DeleteContainer.ts`)

- Currently uses: old `GraphProvider.deleteContainer()`
- Change to: `GraphProvider.getInstance().containers.delete(id)`

### Step 4: Update Tree Items

The tree items `ContainerTreeItem` and `ContainersTreeItem` currently use the legacy `Container` model from `src/models/Container.ts`. They'll need to be updated to use the new schema type from `src/models/schemas/container.ts`.

**`ContainerTreeItem`** (`src/views/treeview/development/ContainerTreeItem.ts`):
- Currently imports `Container` from `../../../models/Container`
- Change to import `Container` from `../../../models/schemas`
- The `container` property type changes from the class-based model to the Zod-inferred type

**`ContainersTreeItem`** (`src/views/treeview/development/ContainersTreeItem.ts`):
- Currently uses `ContainerTypeRegistration.loadContainers()` (old model method)
- Change to use `GraphProvider.getInstance().containers.list(containerTypeId)`
- Will need the container type ID passed in or available from context

### Implementation Order (Suggested)

1. **Create `ContainerService`** — implement all methods
2. **Add to `GraphProvider`** — one small change
3. **Test the service** — add a temporary test call in a command to verify API calls work
4. **Migrate `CreateContainer`** — simplest flow, good first test
5. **Migrate `RenameContainer` and `EditContainerDescription`** — similar update pattern
6. **Migrate `RecycleContainer`** — simple delete call
7. **Migrate `RestoreContainer` and `DeleteContainer`** — recycled container operations
8. **Update tree items** — change imports and data access patterns
9. **Clean up** — remove unused legacy imports

### Testing Your Changes

1. `npm run compile` (or watch mode) — make sure it compiles
2. Press **F5** → Extension Development Host
3. Sign in with an SPE admin account
4. Create a trial container type (if you don't have one)
5. Register it on your tenant
6. Test each container operation:
   - Create a container
   - Rename it
   - Edit its description
   - Recycle it
   - Restore it
   - Permanently delete it
7. Check the Output panel ("SharePoint Embedded") for your `[ContainerService.xxx]` logs

---

## 14. Patterns & Conventions

### Error Handling in Services

```typescript
async methodName(params): Promise<ReturnType> {
    try {
        console.log(`[ContainerService.methodName] Starting operation...`);
        // ... do the work ...
        console.log(`[ContainerService.methodName] Success:`, result.id);
        return result;
    } catch (error: any) {
        console.error(`[ContainerService.methodName] Error:`, error);
        throw new Error(`Failed to do thing: ${error.message || error}`);
    }
}
```

### Progress Notifications

```typescript
const progressWindow = new ProgressWaitNotification(
    vscode.l10n.t('Creating container...')
);
progressWindow.show();
try {
    // ... do work ...
    progressWindow.hide();
} catch (error) {
    progressWindow.hide();
    // handle error
}
```

Import: `import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';`

### User Input Validation

```typescript
const name = await vscode.window.showInputBox({
    placeHolder: vscode.l10n.t('Enter a name'),
    prompt: vscode.l10n.t('Container name'),
    validateInput: (value: string) => {
        if (!value) { return 'Name cannot be empty'; }
        if (value.length > 50) { return 'Name too long'; }
        return undefined;  // valid
    }
});
if (!name) { return; }  // user cancelled
```

### Confirmation Before Destructive Actions

```typescript
const userChoice = await vscode.window.showInformationMessage(
    vscode.l10n.t('Are you sure you want to delete this?'),
    vscode.l10n.t('OK'),
    vscode.l10n.t('Cancel')
);
if (userChoice === vscode.l10n.t('Cancel')) { return; }
```

### Tree View Refresh After Mutations

Always refresh after creating, updating, or deleting something:
```typescript
DevelopmentTreeViewProvider.getInstance().refresh();
```

Or refresh a specific subtree:
```typescript
DevelopmentTreeViewProvider.getInstance().refresh(someTreeItem);
```

### Logging Convention

Prefix all log messages with `[ClassName.methodName]`:
```typescript
console.log('[ContainerService.create] Creating container:', data.displayName);
console.error('[ContainerService.create] Error:', error);
```

### Import Conventions

```typescript
// New schemas — import from models/schemas
import { Container, ContainerCreate } from '../../models/schemas';

// New services — import from services/Graph/
import { GraphProvider } from '../../services/Graph/GraphProvider';

// Auth state
import { AuthenticationState } from '../../services/AuthenticationState';

// VS Code
import * as vscode from 'vscode';

// Graph client (for service files)
import * as Graph from '@microsoft/microsoft-graph-client';
```

### Localization

Use `vscode.l10n.t()` for user-facing strings:
```typescript
vscode.l10n.t('Creating container...')
vscode.l10n.t('Display name must be no more than {0} characters long', maxLength)
```

---

## 15. Key File Reference

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry point. Registers commands, tree views, auth listeners. |
| `src/commands/Command.ts` | Abstract base class for all commands. |
| `src/commands/index.ts` | Barrel export — all commands in one `Commands` namespace. |
| `src/commands/ContainerTypes/CreateTrialContainerType.ts` | **Reference implementation** of a fully-migrated command. |
| `src/commands/Containers/CreateContainer.ts` | **Your target**: Create container (legacy). |
| `src/commands/Container/RenameContainer.ts` | **Your target**: Rename container (legacy). |
| `src/commands/Container/EditContainerDescription.ts` | **Your target**: Edit description (legacy). |
| `src/commands/Container/RecycleContainer.ts` | **Your target**: Recycle container (legacy). |
| `src/commands/RecycledContainer/DeleteContainer.ts` | **Your target**: Permanently delete (legacy). |
| `src/commands/RecycledContainer/RestoreContainer.ts` | **Your target**: Restore from recycle (legacy). |
| `src/services/Graph/GraphProvider.ts` | **New** singleton service hub. You'll add `.containers` here. |
| `src/services/Graph/ApplicationService.ts` | **Reference**: Service implementation template. |
| `src/services/Graph/ContainerTypeService.ts` | **Reference**: Another service template. |
| `src/services/GraphProvider.ts` | **Old legacy** provider — has the API endpoints you need to replicate. |
| `src/services/Auth/VSCodeAuthProvider.ts` | Base auth provider using VS Code's auth API. |
| `src/services/Auth/GraphAuthProvider.ts` | Graph-specific auth with pre-configured scopes. |
| `src/services/AuthenticationState.ts` | Centralized auth state management. |
| `src/models/schemas/container.ts` | **Already exists**: Container Zod schemas and types. |
| `src/models/schemas/index.ts` | Barrel exports for all schemas. |
| `src/views/treeview/development/DevelopmentTreeViewProvider.ts` | Main tree view — call `.refresh()` after data changes. |
| `src/views/treeview/development/ContainerTreeItem.ts` | **Your target**: Update to use new schema. |
| `src/views/treeview/development/ContainersTreeItem.ts` | **Your target**: Update to use new service. |
| `src/views/treeview/development/IDataProvidingTreeItem.ts` | Base class for tree items with children. |
| `src/views/notifications/ProgressWaitNotification.ts` | Progress notification helper. |
| `package.json` | Extension manifest — command declarations, menu bindings, `when` clauses. |
| `.vscode/launch.json` | Debug configurations (Run Extension, Extension Tests). |
| `CLAUDE.md` | Detailed refactor notes and architecture documentation. |

---

## 16. Glossary

| Term | Definition |
|------|-----------|
| **SharePoint Embedded (SPE)** | A Microsoft 365 platform for building file/document management apps backed by SharePoint storage. |
| **Container Type** | A template that defines a category of storage containers. Created by tenant admins. Has a billing classification (trial or standard). |
| **Container** | An instance of a Container Type. Holds files and documents. Has permissions, custom properties, and versioning settings. |
| **Owning App** | The Entra ID (Azure AD) application registration that owns a Container Type. Has full control. |
| **Guest App** | An additional application registration granted permission to access a Container Type's containers. |
| **Registration** | The act of registering a Container Type on a specific tenant, which enables creating containers of that type on that tenant. |
| **Delegated Auth** | API calls made on behalf of the signed-in user. The user's permissions determine what the call can do. |
| **App-Only Auth** | API calls made as the application itself (no user context). Uses a client secret or certificate. This is the old pattern we're moving away from. |
| **1P App (First-Party)** | The extension's own Entra ID application registration. It's a public client (no secret). Used for sign-in. |
| **3P App (Third-Party)** | The developer's application registration (owning app or guest app). May have secrets/certs. |
| **Graph API** | Microsoft Graph — the unified API for Microsoft 365 services. Base URL: `https://graph.microsoft.com`. |
| **Entra ID** | Microsoft's identity platform (formerly Azure Active Directory / Azure AD). |
| **MSAL** | Microsoft Authentication Library — handles OAuth 2.0 flows. The old architecture used it directly; the new one uses VS Code's built-in auth. |
| **PKCE** | Proof Key for Code Exchange — an OAuth 2.0 extension for public clients. Used by the auth flow. |
| **JWT** | JSON Web Token — the format of access tokens. Contains claims like `tid` (tenant), `wids` (roles). |
| **Extension Host** | The VS Code process where extensions run. Separate from the VS Code UI process. |
| **Extension Development Host** | A second VS Code window launched during debugging that has your extension loaded for testing. |
| **Context Value** | A string set on tree items (`contextValue`) used in `when` clauses to control which menu items appear. |
| **Zod** | A TypeScript-first schema validation library. Used for runtime type checking of API responses. |
| **`beta` vs `v1.0`** | Microsoft Graph API versions. Container APIs use `beta`. Application APIs use `v1.0`. |
| **ETag** | An entity tag for optimistic concurrency control. Some update operations require passing the current ETag. |
