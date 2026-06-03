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
8. [Service Layer](#8-service-layer)
9. [Schema Models (Zod)](#9-schema-models-zod)
10. [Commands — How They Work](#10-commands--how-they-work)
11. [Tree Views — How the UI Works](#11-tree-views--how-the-ui-works)
12. [Container Type Creation Flow (trial / standard / direct-to-customer)](#12-container-type-creation-flow-trial--standard--direct-to-customer)
13. [Patterns & Conventions](#13-patterns--conventions)
14. [Key File Reference](#14-key-file-reference)
15. [Glossary](#15-glossary)

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
- Create and manage Container Types across all three billing classifications: **trial**, **standard** (owner-org billed), and **direct-to-customer** (user-org billed)
- For standard CTs, set up the Azure-side billing account (Microsoft.Syntex provider registration + `Microsoft.Syntex/accounts` resource) without leaving VS Code
- Add up to three container-type owners by searching tenant users
- Register Container Types on tenants
- Create, rename, recycle, restore, and delete Containers
- Manage application registrations (owning apps, guest apps, credentials)
- Export Postman configurations for API testing
- Manage permissions and discoverability settings

### Architecture at a Glance

Active work happens on feature branches off `main` (current example: `aljordac/paid-container-type-support`, which adds paid container type support). The auth + service refactor that preceded the paid-CT work has fully landed — there are no legacy providers, no app-only auth, and no class-based models left in `src/`. Code follows three layers, end-to-end:

- **Schema models** (pure data, Zod-validated) — `src/models/schemas/`
- **Services** (business logic, API calls) — `src/services/Graph/` and `src/services/ARM/`, accessed via the `GraphProvider.getInstance()` / `ARMProvider.getInstance()` singleton hubs
- **Commands** (thin UI wrappers) — `src/commands/`

All Graph and ARM calls are **delegated** (on behalf of the signed-in user) and routed through VS Code's built-in Microsoft authentication API — no MSAL/PKCE, no client secrets, no app-only paths anywhere.

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

1. **Clone the repo and check out the branch you want to work on:**
   ```bash
   git clone https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension.git
   cd SharePoint-Embedded-VS-Code-Extension
   # main is the stable branch. For active paid-CT work, the live feature
   # branch is currently aljordac/paid-container-type-support — substitute
   # whatever branch you're contributing to.
   git checkout main
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
main                                       ← stable; PRs target here
  ├── aljordac/paid-container-type-support ← live paid-CT feature branch (evolving)
  └── <alias>/<feature>                    ← other in-flight feature branches
```

Active paid-CT work lands on the `aljordac/paid-container-type-support` branch and gets PR'd into `main` in batches. The previous "refactor branch" model (everything off `auth-refactor-alex`) is gone — that refactor merged.

### Your Workflow

1. **Create your feature branch off `main`:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b <alias>/<feature>
   ```

   If your work depends on in-flight paid-CT changes, branch from `aljordac/paid-container-type-support` instead and target that branch with your PR.

2. **Do your work, commit regularly.**

3. **Submit PRs into `main`** (or into the feature branch you forked from).

4. **Stay in sync** — pull from your base regularly:
   ```bash
   git checkout main
   git pull origin main
   git checkout <alias>/<feature>
   git merge main
   ```

### Areas to Touch Carefully

These are load-bearing and easy to break — pair-review with a maintainer before non-trivial changes:

- `src/services/Auth/` — authentication providers (Graph + ARM).
- `src/services/AuthenticationState.ts` — auth state singleton; UI visibility depends on its ordering.
- `src/services/Graph/GraphProvider.ts` and `src/services/ARM/ARMProvider.ts` — service-hub singletons. Add new services here, don't restructure existing ones.
- `src/views/treeview/development/DevelopmentTreeViewProvider.ts` — main tree orchestrator. Refresh semantics and root-fetch dedup are subtle.
- `src/views/treeview/development/ContainerTypeTreeItem.ts` and `BillingDecorationProvider.ts` — contextValue composition and ⚠ decoration drive a lot of `when`-clause behavior in `package.json`.
- `src/commands/ContainerTypes/CreateContainerType.ts` and the `runXxxFlow` / `attachBillingToContainerType` modules — paid-CT entry point. Preserve the "create CT first, then attach billing best-effort" ordering (§13).

---

## 5. Architecture Overview

### The Layer Stack

```
┌─────────────────────────────────────────────┐
│              Commands (UI Actions)           │  src/commands/
│  Thin wrappers: auth check → input →        │
│  service call → error handling → UI update   │
├──────────────────────┬──────────────────────┤
│  Graph services      │  ARM services        │  src/services/Graph/, src/services/ARM/
│  Microsoft Graph     │  Azure Resource Mgr  │
│  CT, registration,   │  Subscriptions,      │
│  app grants, users,  │  Microsoft.Syntex    │
│  containers          │  provider + accounts │
├──────────────────────┴──────────────────────┤
│        Schema Models (Type-Safe Data)        │  src/models/schemas/
│  Zod schemas for runtime validation          │
│  Pure data types, no methods                 │
├─────────────────────────────────────────────┤
│              APIs (External)                 │
│  Microsoft Graph API (graph.microsoft.com)   │
│  Azure Resource Manager (management.azure.com)│
│  Microsoft.Syntex resource provider          │
└─────────────────────────────────────────────┘
```

Standard container types touch both service layers in a single command: the CT is created via Graph, then billing is attached via ARM. Trial and direct-to-customer CTs only touch Graph.

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
│   ├── Container/                  # Container operations
│   │   ├── RenameContainer.ts
│   │   ├── EditContainerDescription.ts
│   │   ├── RecycleContainer.ts
│   │   ├── CopyContainerId.ts
│   │   └── ViewContainerProperties.ts
│   ├── Containers/                 # Container creation
│   │   └── CreateContainer.ts
│   ├── ContainerType/              # Container type operations (per-CT)
│   │   ├── AttachBilling.ts                 # Retry billing on a -billingInvalid CT
│   │   ├── AddContainerTypeOwners.ts        # Multi-select user picker → add owners
│   │   ├── ListContainerTypePermissions.ts  # Read current permissions
│   │   ├── RegisterOnLocalTenant.ts         # Register CT + optional DTC billing prompt
│   │   ├── GrantExtensionAppPermissions.ts  # Grant the 1P extension app on a CT
│   │   └── ... (Rename/Delete/Discoverability, etc.)
│   ├── ContainerTypes/             # Container type creation (entry points)
│   │   ├── CreateContainerType.ts           # UNIFIED entry: pick billing → name → app → flow
│   │   ├── CreateTrialContainerType.ts      # Exports runTrialFlow
│   │   ├── runStandardFlow.ts               # Standard CT: Graph create + ARM billing attach
│   │   ├── runDirectToCustomerFlow.ts       # DTC CT: Graph create only
│   │   ├── attachBillingToContainerType.ts  # ARM orchestrator (shared by Create + AttachBilling)
│   │   ├── promptDirectToCustomerBillingSetup.ts # Post-registration DTC prompt
│   │   └── ui/                              # Quickpicks / inputs for the create flow
│   │       ├── pickBillingType.ts
│   │       ├── pickSubscription.ts
│   │       ├── pickResourceGroup.ts
│   │       ├── pickContainerTypeOwners.ts
│   │       └── promptForContainerTypeDisplayName.ts
│   ├── GuestApps/                  # Guest app permissions
│   └── RecycledContainer/          # Recycled container operations
│       ├── DeleteContainer.ts
│       ├── RestoreContainer.ts
│       └── CopyContainerId.ts
├── services/
│   ├── Auth/                       # Authentication providers
│   │   ├── VSCodeAuthProvider.ts   # Base: wraps VS Code's auth API
│   │   ├── GraphAuthProvider.ts    # Graph-specific auth (extends VSCodeAuthProvider)
│   │   ├── ARMAuthProvider.ts      # ARM auth — used by the Standard CT flow
│   │   ├── AppAuthProviderFactory.ts # Per-3P-app delegated provider factory (Postman export, etc.)
│   │   └── index.ts
│   ├── Graph/                      # Graph API service layer
│   │   ├── GraphProvider.ts        # Singleton hub — access point for all Graph services
│   │   ├── ApplicationService.ts   # REFERENCE: Application CRUD & credentials
│   │   ├── ContainerTypeService.ts # Container type management
│   │   ├── ContainerTypeRegistrationService.ts
│   │   ├── ContainerTypeAppPermissionGrantService.ts
│   │   ├── ContainerService.ts     # Containers + recycled containers
│   │   └── UserService.ts          # Tenant user search (owner picker)
│   ├── ARM/                        # Azure Resource Manager service layer
│   │   ├── ARMProvider.ts          # Singleton hub — access point for all ARM services
│   │   ├── SubscriptionService.ts  # List subscriptions / resource groups
│   │   ├── SyntexProviderService.ts # Register + poll Microsoft.Syntex on a sub
│   │   ├── SyntexAccountService.ts # Create/get Microsoft.Syntex/accounts (billing account)
│   │   ├── armFetch.ts             # Low-level ARM HTTP wrapper (armRequest, ArmError)
│   │   └── diagnoseArmError.ts     # Classify ARM errors (policy/RBAC/region/dup account)
│   ├── AuthenticationState.ts      # Centralized auth state singleton
│   ├── StorageProvider.ts          # VS Code storage abstraction
│   ├── TelemetryProvider.ts        # Application Insights telemetry
│   └── UriHandler.ts               # vscode:// deep-link handler (tenant + CT targeting)
├── models/
│   ├── index.ts                    # Barrel re-exports from schemas/ and telemetry/
│   ├── schemas/                    # Zod schema models
│   │   ├── index.ts                # Barrel exports
│   │   ├── application.ts          # Application schema
│   │   ├── containerType.ts        # Container type schema (includes billingClassification + billingStatus)
│   │   ├── container.ts            # Container schema
│   │   ├── containerTypeRegistration.ts # Registration schema (includes per-tenant billingStatus)
│   │   ├── containerTypeAppPermissionGrant.ts
│   │   ├── user.ts                 # Tenant user schema (owner picker)
│   │   ├── arm.ts                  # ARM-side schemas (subscription, RG, Syntex account)
│   │   └── shared.ts               # Shared schemas (BillingClassification, etc.)
│   └── telemetry/                  # Telemetry event definitions
├── views/
│   ├── treeview/development/       # Development sidebar tree view
│   │   ├── DevelopmentTreeViewProvider.ts   # Main tree data provider
│   │   ├── ContainerTypesTreeItem.ts        # Root "Container Types" node
│   │   ├── ContainerTypeTreeItem.ts         # Individual container type
│   │   ├── BillingDecorationProvider.ts     # FileDecorationProvider — ⚠ tint for billingInvalid rows
│   │   ├── OwningAppTreeItem.ts             # Owning app under a CT
│   │   ├── LocalRegistrationTreeItem.ts     # Registration info (per-tenant billing status)
│   │   ├── ContainersTreeItem.ts            # "Containers" folder
│   │   ├── ContainerTreeItem.ts             # Individual container
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

### Architecture Summary

| Aspect | How it works today |
|--------|--------------------|
| **Data models** | Zod schemas in `models/schemas/` — pure data, no methods. Runtime-validated at the service boundary. |
| **API calls** | Stateless service classes in `services/Graph/` (Microsoft Graph) and `services/ARM/` (Azure Resource Manager). |
| **Auth** | `VSCodeAuthProvider` base → `GraphAuthProvider` and `ARMAuthProvider`. All calls delegated; VS Code's built-in Microsoft auth handles token acquisition. No MSAL, no PKCE, no app-only auth, no client secrets. |
| **Service access** | `GraphProvider.getInstance()` and `ARMProvider.getInstance()` singleton hubs. |
| **Type safety** | Runtime-validated with Zod | TypeScript types only (no runtime checks) |

### Key Singletons

| Singleton | Access | Purpose |
|-----------|--------|---------|
| `GraphProvider` | `GraphProvider.getInstance()` | Hub for all Graph API services |
| `ARMProvider` | `ARMProvider.getInstance()` | Hub for Azure Resource Manager services (subscriptions, Syntex provider, Syntex billing accounts). Used by the Standard CT billing flow. |
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
  ├── GraphAuthProvider            (Microsoft Graph — https://graph.microsoft.com/.default)
  └── ARMAuthProvider              (Azure Resource Manager — https://management.azure.com/.default)
```

**`VSCodeAuthProvider`** (`src/services/Auth/VSCodeAuthProvider.ts`):
- Wraps `vscode.authentication.getSession()` with VS Code-specific scope prefixes.
- Supports `VSCODE_CLIENT_ID:` and `VSCODE_TENANT:` scope prefixes that VS Code's Microsoft auth provider uses internally.
- Provides `getAuthHandler()` that returns a callback compatible with the Microsoft Graph SDK.

**`GraphAuthProvider`** (`src/services/Auth/GraphAuthProvider.ts`):
- Extends `VSCodeAuthProvider`, requests `https://graph.microsoft.com/.default` (i.e. all delegated scopes statically pre-authorized on the 1P app registration). Pre-authorized scopes include:
  - `Application.ReadWrite.All`
  - `FileStorageContainerType.Manage.All`
  - `FileStorageContainerTypeReg.Manage.All`
  - `FileStorageContainer.Selected`
  - `User.Read.All` — required by the owner picker (`UserService.search`)
- Singleton pattern — `GraphAuthProvider.getInstance()`.

**`ARMAuthProvider`** (`src/services/Auth/ARMAuthProvider.ts`):
- Extends `VSCodeAuthProvider`, requests `https://management.azure.com/.default`.
- Used only by `armRequest` (`src/services/ARM/armFetch.ts`), so only the Standard CT path (and the Attach Billing retry for standard CTs) trigger ARM token acquisition. Trial and direct-to-customer flows never touch ARM, so users on those paths never see an ARM consent prompt.
- `armFetch.ts` passes the existing Graph account to the auth provider so the ARM acquisition goes straight to silent for that identity — only first-time Entra consent for the `management.azure.com` resource can surface a prompt.
- Singleton pattern — `ARMAuthProvider.getInstance()`.

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

All API calls are made **on behalf of the signed-in user** (delegated permissions). The 1P client app is a public client — there are no app secrets stored for the extension itself. There is no app-only auth anywhere in `src/`; everything routes through `GraphAuthProvider` or `ARMAuthProvider`.

When a 3P app's own context is needed (e.g. exporting a Postman environment that calls SPE APIs as the developer's app, not the SPE 1P app), the helper is `AppAuthProviderFactory` in `src/services/Auth/`. It produces a delegated provider scoped to the 3P app's `appId` — still delegated, still no secrets.

---

## 8. Service Layer

### GraphProvider — The Service Hub

`GraphProvider` (`src/services/Graph/GraphProvider.ts`) is a singleton that provides access to all Graph API services:

```typescript
const graphProvider = GraphProvider.getInstance();

// Access services:
graphProvider.applications        // → ApplicationService
graphProvider.containerTypes      // → ContainerTypeService (incl. listPermissions / addOwner)
graphProvider.registrations       // → ContainerTypeRegistrationService
graphProvider.appPermissionGrants // → ContainerTypeAppPermissionGrantService
graphProvider.containers          // → ContainerService
graphProvider.users               // → UserService (tenant user search for the owner picker)
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
| `ContainerTypeService` | `.containerTypes` | `/storage/fileStorage/containerTypes` | `v1.0` |
| `ContainerTypeRegistrationService` | `.registrations` | `.../containerTypes/{id}/...` | `v1.0` |
| `ContainerTypeAppPermissionGrantService` | `.appPermissionGrants` | `/storage/fileStorage/containerTypeRegistrations/{id}/applicationPermissionGrants` | `v1.0` |
| `ContainerService` | `.containers` | `/storage/fileStorage/containers` | `v1.0` |
| `UserService` | `.users` | `/users` | `v1.0` |

### ARMProvider — The ARM Service Hub

`ARMProvider` (`src/services/ARM/ARMProvider.ts`) mirrors `GraphProvider` for Azure Resource Manager calls. It only exists for discoverability — each service is a thin wrapper over `armRequest` (`src/services/ARM/armFetch.ts`), so there's no Graph-SDK-equivalent shared client to inject.

```typescript
const armProvider = ARMProvider.getInstance();

armProvider.subscriptions    // → SubscriptionService (list subs / resource groups, RBAC check)
armProvider.syntexProviders  // → SyntexProviderService (register + poll Microsoft.Syntex on a sub)
armProvider.syntexAccounts   // → SyntexAccountService (create/get Microsoft.Syntex/accounts billing resource)
```

#### Available ARM Services

| Service | Property on ARMProvider | API base | Notes |
|---------|------------------------|----------|-------|
| `SubscriptionService` | `.subscriptions` | `/subscriptions`, `/subscriptions/{id}/resourcegroups`, `/subscriptions/{id}/providers/Microsoft.Authorization/permissions` | Lists subs (Microsoft.Resources api-version), enumerates RGs, and checks Owner/Contributor RBAC before billing. |
| `SyntexProviderService` | `.syntexProviders` | `/subscriptions/{id}/providers/Microsoft.Syntex/register`, `/subscriptions/{id}/providers/Microsoft.Syntex` | Registers the `Microsoft.Syntex` resource provider and polls `registrationState` until `Registered`. |
| `SyntexAccountService` | `.syntexAccounts` | `/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Syntex/accounts/{containerTypeId}` | PUT creates / replaces the Syntex billing account for a CT; GET reads its state. The resource name is the container type ID. |

Each service passes its required `api-version` per call (via `ArmRequestOptions.apiVersion` in `armFetch.ts`); there isn't a single global ARM api-version. When adding a new ARM call, look up the current api-version in the [Azure REST docs](https://learn.microsoft.com/rest/api/azure/) and hard-code it next to the call.

#### `armFetch.ts` and `diagnoseArmError.ts` — use them, don't reinvent

- `armRequest<T>(options)` is the single ARM HTTP wrapper. It handles bearer-token acquisition (silent → interactive fallback), URL building with `api-version`, body serialization, and non-2xx → `ArmError` mapping. All ARM services go through it.
- `diagnoseArmError(error)` is the single ARM error classifier. It pattern-matches `ArmError.code`, status, and body to map to user-actionable messages: policy block, RBAC 403, unsupported region, duplicate `Microsoft.Syntex/accounts` in another RG, SPO tenant already linked to a different Syntex account. Route every catch block in `services/ARM/*` and the paid-CT commands through it before surfacing a toast — and extend it (rather than adding a new classifier) when a new ARM error shape comes up.

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

### Anatomy of a Command (single-step)

Using `CreateTrialContainerType` (which exports `runTrialFlow`) as the reference — the cleanest example of the current single-step command pattern:

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

### Reference: Multi-step Flow with Branching

For commands that branch into multiple sub-flows (today: the unified container-type create entry point), the convention is:

- A top-level command file owns the **invariant** parts: auth check, top-level pickers (e.g. billing classification), shared inputs (display name), the owning-app picker.
- One `runXxxFlow.ts` file per branch lives in the same directory and is invoked by the top-level command. Each `runXxxFlow` returns the same shape (`Promise<ContainerType | undefined>`) so the entry point can stay branch-agnostic.
- Per-step UI lives in a sibling `ui/` directory as small, self-contained quickpicks / input boxes (one file per quickpick).

Reference layout — `src/commands/ContainerTypes/`:

```text
CreateContainerType.ts          ← entry point, owns: auth → pickBillingType → displayName → GetOrCreateApp → switch
  ├── runTrialFlow              (CreateTrialContainerType.ts)
  ├── runStandardFlow           (runStandardFlow.ts)        ← Graph create + ARM billing attach
  └── runDirectToCustomerFlow   (runDirectToCustomerFlow.ts) ← Graph create only
ui/
  pickBillingType.ts            ← trial / standard / directToCustomer quickpick
  promptForContainerTypeDisplayName.ts
  pickSubscription.ts           ← Azure subscription quickpick (used by runStandardFlow)
  pickResourceGroup.ts          ← RG quickpick (used by runStandardFlow)
  pickContainerTypeOwners.ts    ← multi-select user picker (used by AddContainerTypeOwners)
```

Key convention to preserve when extending this pattern:

> **Create the container type in Graph first, then attempt billing best-effort.** If billing setup fails, leave the CT in place and mark the row `-billingInvalid` (see §11). Don't roll back the Graph create — the user can retry billing later via the `Attach billing…` context menu. This is the same pattern `AttachBilling.ts` re-enters on retry.

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
        │   ├── ContainersTreeItem ("Containers")
        │   │   ├── ContainerTreeItem ("Container A")
        │   │   └── ContainerTreeItem ("Container B")
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

#### Container-type and registration suffix vocabulary

`ContainerTypeTreeItem.contextValue` composes the following suffixes in order. New menu items targeting paid CTs should match against these:

| Suffix | When it's added | What it gates |
|--------|-----------------|---------------|
| `-trial` | `billingClassification === 'trial'` | Trial-only menu items; tree row shows `(trial, expires in N days)` description suffix. |
| `-standard-paid` | `billingClassification === 'standard'` (default) | Standard-CT menu items (Attach billing, copy subscription, etc.). `-paid` is kept as a back-compat alias so older `=~ /-paid/` predicates keep matching. |
| `-directToCustomer` | `billingClassification === 'directToCustomer'` | DTC-only menu items (DTC billing prompt). |
| `-billingInvalid` | `billingStatus !== 'valid'` on the CT, OR `billingStatus !== 'valid'` on its registration | Shows **Attach billing…** and hides Postman / sample-app submenus. |
| `-discoverabilityEnabled` / `-discoverabilityDisabled` | From `containerType.settings.isDiscoverabilityEnabled` | Discoverability toggle menu items. |
| `-registered` / `-unregistered` | Whether the CT is registered on the local tenant | Register / unregister menu items. |
| `-extensionPermissionsGranted` | 1P extension app has the required delegated grants on the CT | Hides the "Grant extension app permissions" menu item once granted. |

The registration tree item (`LocalRegistrationTreeItem`) carries its own `-billingInvalid` suffix evaluated **per tenant** — DTC billing is set up per consuming tenant, so the same CT can be billing-valid in one tenant and billing-invalid in another.

#### `BillingDecorationProvider` — yellow ⚠ tint for billing-invalid rows

`src/views/treeview/development/BillingDecorationProvider.ts` is a `vscode.FileDecorationProvider` that tints CT / registration rows yellow (`list.warningForeground`) when billing isn't set up. Two helpers are exported and used from the tree-item constructors:

- `tintBillingInvalid(item, id)` — registers the item's resource URI with the provider so its label renders amber.
- `blockBillingInvalid(item)` — sets the item's `contextValue` so child menu items (sample apps, Postman) are hidden until billing is valid. Used for the owning-app + guest-app subtrees of a billing-invalid CT — the visual tint stays on the parent CT row only, descendants stay neutral.

The hover tooltip wording on the CT row is classification-specific (standard: "Right-click and choose **Attach billing**…"; DTC: "Direct-to-customer container types are billed per consuming tenant…"). Keep that copy in `ContainerTypeTreeItem` so the two messages stay close together.

---

## 12. Container Type Creation Flow (trial / standard / direct-to-customer)

This section walks through what the user sees and what the code does for each of the three billing classifications. Start here when extending paid-CT support — it points at the canonical files for each step.

### Entry point — `spe.ContainerTypes.create`

Exposed two ways:

- The **"Create container type"** button in the Development view's welcome content (`spe-development`, when `spe:isLoggedIn && spe:showGettingStartedView`).
- The Command Palette: **SharePoint Embedded: Create container type**.

The handler is `src/commands/ContainerTypes/CreateContainerType.ts`. Its only job is to orchestrate the invariant prefix and dispatch:

```text
1. AuthenticationState.isSignedIn check
2. pickBillingType()                       → 'trial' | 'standard' | 'directToCustomer' | undefined
3. promptForContainerTypeDisplayName()     → string | undefined
4. GetOrCreateApp.run(true)                → owning Entra app (existing or newly created)
5. switch (classification):
     trial            → runTrialFlow({ displayName, app })
     standard         → runStandardFlow({ displayName, app })
     directToCustomer → runDirectToCustomerFlow({ displayName, app })
```

All three `runXxxFlow` functions return `Promise<ContainerType | undefined>`, so the entry point stays branch-agnostic.

### Trial flow — `runTrialFlow` (in `CreateTrialContainerType.ts`)

The simplest path:

1. `graphProvider.containerTypes.create({ name, owningAppId, billingClassification: 'trial' })`.
2. Telemetry event, refresh `DevelopmentTreeViewProvider`, success toast.

No ARM, no per-tenant billing. The trial CT carries a description suffix on its tree row (`(trial, expires in N days)` or `(trial, expired)`) — set by `ContainerTypeTreeItem` from `expirationDateTime`.

### Standard flow — `runStandardFlow`

This is the most complex flow. The shape is "create the CT first, then attach billing best-effort." If the billing step fails, the CT is left in place with `-billingInvalid`, and the user can retry from the context menu.

1. **Graph create** — `graphProvider.containerTypes.create({ name, owningAppId, billingClassification: 'standard' })`. The CT exists at this point regardless of what happens next.
2. **Refresh tree** — `DevelopmentTreeViewProvider.getInstance().refresh()`. The new CT row appears (possibly with `⚠ Billing not set up` if step 3 doesn't complete).
3. **Best-effort ARM billing setup** — runs `attachBillingToContainerType(containerType)`:
   - `pickSubscription` (uses `armProvider.subscriptions.list()`).
   - **RBAC precheck** — `armProvider.subscriptions.checkRbac()` confirms the signed-in user has Owner or Contributor on the chosen subscription. On 403, surface the Azure RBAC docs link.
   - `pickResourceGroup` (uses `armProvider.subscriptions.listResourceGroups(subscriptionId)`).
   - `armProvider.syntexProviders.registerAndAwait(subscriptionId)` — POSTs to `/providers/Microsoft.Syntex/register` then polls `registrationState` until `Registered`.
   - `armProvider.syntexAccounts.createOrReplace(subscriptionId, rg, containerTypeId)` — PUTs the `Microsoft.Syntex/accounts` ARM resource whose name is the container-type ID. This is the billing account.
4. **Error surface** — every catch in this flow routes through `diagnoseArmError(error)` so the toast tells the user the actionable cause (Azure Policy block, missing RBAC, unsupported region, duplicate Syntex account in another RG, SPO tenant already linked to a different Syntex account).
5. **Outcome** — on success, refresh the tree; the CT row drops the `⚠`. On failure, the CT stays put with `-billingInvalid` and the user can retry via **Attach billing**.

User prerequisites to surface in error messages: Owner/Contributor on the subscription; a resource group in a Syntex-supported Azure region; if Azure Policy is configured, it must allow `Microsoft.Syntex/accounts`.

### Direct-to-customer flow — `runDirectToCustomerFlow`

Symmetric in shape to the trial flow at create time, plus a post-registration billing prompt.

1. **Graph create** — `graphProvider.containerTypes.create({ name, owningAppId, billingClassification: 'directToCustomer' })`.
   - If the tenant hasn't enabled the DTC billing flag, Graph rejects this with a 403/400 mentioning `directToCustomer` / "not enabled". Detect it, show an error toast, and offer a "Learn more" button linking to the passthrough-billing docs.
2. **Refresh tree** — the DTC CT row has no description suffix when billing is valid in this tenant; otherwise the row shows `⚠ Billing not set up` with the DTC-flavored tooltip (per-consuming-tenant pay-as-you-go).
3. **No ARM step at create time.** DTC billing lives per consuming tenant on the M365 admin center, not on Azure.
4. **Post-registration** — `RegisterOnLocalTenant` calls `promptDirectToCustomerBillingSetup(containerType, registration)` *only when the registration's `billingStatus !== 'valid'`*. It shows a modal with three actions:
   - **Set up billing** → opens `https://admin.microsoft.com` Pay-As-You-Go in the browser.
   - **Learn more** → opens the passthrough-billing docs.
   - **Cancel** — dismisses; the registration still exists, the registration row stays `-billingInvalid`.

### Retry via Attach Billing — `spe.ContainerType.attachBilling`

Lives in `src/commands/ContainerType/AttachBilling.ts`. Wired in `package.json` to context-menu items whose `viewItem` matches `-billingInvalid`. Branches on the target CT's classification:

- **Standard** → re-enters `attachBillingToContainerType(containerType)` (same orchestrator the create flow uses).
- **Direct-to-customer** → re-shows `promptDirectToCustomerBillingSetup`.

This is also the recovery path when the create flow's billing step was canceled, denied, or failed for transient reasons — the CT exists, the user just needs to come back later.

### Owner management — `AddContainerTypeOwners`

Lives in `src/commands/ContainerType/AddContainerTypeOwners.ts`. Right-click a CT row to invoke.

Flow:

1. Open a multi-select user picker (`ui/pickContainerTypeOwners.ts`) backed by `graphProvider.users.search(query)`. The picker:
   - Searches members only by default (name, email, UPN).
   - Caps the selection at **3 owners total** (matches the SPE permission ceiling). When the cap is hit, the picker title shows a transient hint "Maximum 3 owners — unselect one to add another".
2. For each selected user, call `graphProvider.containerTypes.addOwner(containerTypeId, userId)`.
3. Refresh the tree.

If the signed-in user's token doesn't include `User.Read.All`, `UserService.search` will 403. The picker surfaces a toast explaining the scope requirement.

---

## 13. Patterns & Conventions

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

### ARM error handling — go through `diagnoseArmError`

Every catch block in `services/ARM/*` and the paid-CT commands that call ARM should route through `diagnoseArmError(error)` before surfacing a toast. It pattern-matches `ArmError.code`, status, and body to map the failure to a user-actionable cause (policy block, RBAC 403, unsupported region, duplicate `Microsoft.Syntex/accounts`, SPO tenant already linked) and returns the toast-ready message.

Do not write per-call ad-hoc classifiers — when a new ARM error shape comes up, extend `diagnoseArmError` so the next caller gets the new mapping for free.

```typescript
import { armRequest, ArmError } from '../../services/ARM/armFetch';
import { diagnoseArmError } from '../../services/ARM/diagnoseArmError';

try {
    await armRequest({ /* … */ });
} catch (error) {
    const diagnosis = diagnoseArmError(error);
    vscode.window.showErrorMessage(diagnosis.message);
    if (diagnosis.docsUrl) {
        // optional: offer "Learn more" button that opens diagnosis.docsUrl
    }
}
```

### Best-effort post-create billing

The paid-CT flows follow a specific ordering that callers should preserve:

1. Create the container type via Graph **first**. From this point on the CT exists in the tenant — never silently roll it back.
2. Attempt billing setup (ARM for Standard, M365 prompt for DTC) **best-effort**.
3. If billing setup fails or is canceled, refresh the tree so the row picks up the `-billingInvalid` suffix (driven by `billingStatus !== 'valid'`). The user can retry via the **Attach billing…** context menu, which re-enters the same orchestrator.

This is why `runStandardFlow` doesn't wrap the create + ARM steps in a single transaction-style try/catch — the two have different recovery stories. Any new paid-CT flow should keep this ordering so the Attach Billing retry continues to work.

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
// Schemas — import from models/schemas
import { Container, ContainerCreate } from '../../models/schemas';

// Graph services — import via the singleton hub
import { GraphProvider } from '../../services/Graph/GraphProvider';

// ARM services — import via the singleton hub (paid-CT flows)
import { ARMProvider } from '../../services/ARM/ARMProvider';

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

## 14. Key File Reference

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry point. Registers commands, tree views, auth listeners. |
| `src/commands/Command.ts` | Abstract base class for all commands. |
| `src/commands/index.ts` | Barrel export — all commands in one `Commands` namespace. |
| **Container type creation** | |
| `src/commands/ContainerTypes/CreateContainerType.ts` | **Unified entry point.** Auth → billing-type fork → name → owning app → `runXxxFlow`. |
| `src/commands/ContainerTypes/CreateTrialContainerType.ts` | Exports `runTrialFlow`. Reference for the simple single-step flow. |
| `src/commands/ContainerTypes/runStandardFlow.ts` | Standard CT: Graph create + best-effort ARM billing attach. |
| `src/commands/ContainerTypes/runDirectToCustomerFlow.ts` | DTC CT: Graph create only. Billing happens post-registration. |
| `src/commands/ContainerTypes/attachBillingToContainerType.ts` | ARM billing orchestrator (sub → RBAC → RG → Syntex register → Syntex account). Shared by Create + Attach Billing. |
| `src/commands/ContainerTypes/promptDirectToCustomerBillingSetup.ts` | Post-registration DTC modal (Set up billing / Learn more / Cancel). |
| `src/commands/ContainerTypes/ui/pickBillingType.ts` | Trial / Standard / DTC quickpick. |
| `src/commands/ContainerTypes/ui/pickSubscription.ts` | Azure subscription quickpick (Standard flow). |
| `src/commands/ContainerTypes/ui/pickResourceGroup.ts` | Resource group quickpick (Standard flow). |
| `src/commands/ContainerTypes/ui/pickContainerTypeOwners.ts` | Multi-select user picker for `AddContainerTypeOwners` (max 3). |
| `src/commands/ContainerTypes/ui/promptForContainerTypeDisplayName.ts` | Display-name input box with validation. |
| **Per-CT operations** | |
| `src/commands/ContainerType/AttachBilling.ts` | Context-menu retry. Branches Standard vs. DTC. |
| `src/commands/ContainerType/AddContainerTypeOwners.ts` | Adds owners via the owner picker. |
| `src/commands/ContainerType/ListContainerTypePermissions.ts` | Reads current permissions for a CT. |
| `src/commands/ContainerType/RegisterOnLocalTenant.ts` | Registers a CT; for DTC, triggers `promptDirectToCustomerBillingSetup`. |
| `src/commands/ContainerType/GrantExtensionAppPermissions.ts` | Grants delegated perms to the 1P extension app on a CT. |
| **Container operations** | |
| `src/commands/Containers/CreateContainer.ts` | Create a container via `graphProvider.containers.create()`. |
| `src/commands/Container/RenameContainer.ts`, `EditContainerDescription.ts`, `RecycleContainer.ts` | Single-container operations. |
| `src/commands/RecycledContainer/RestoreContainer.ts`, `DeleteContainer.ts` | Recycled-container operations. |
| **Services** | |
| `src/services/Graph/GraphProvider.ts` | Singleton Graph service hub. |
| `src/services/Graph/ApplicationService.ts` | Reference service implementation. |
| `src/services/Graph/ContainerTypeService.ts` | Container type CRUD + `listPermissions` + `addOwner`. |
| `src/services/Graph/ContainerService.ts` | Containers + recycled containers. |
| `src/services/Graph/UserService.ts` | Tenant user search (owner picker). |
| `src/services/ARM/ARMProvider.ts` | Singleton ARM service hub. |
| `src/services/ARM/SubscriptionService.ts` | List subs / RGs + RBAC precheck. |
| `src/services/ARM/SyntexProviderService.ts` | Register + poll `Microsoft.Syntex` provider. |
| `src/services/ARM/SyntexAccountService.ts` | Create/get the per-CT `Microsoft.Syntex/accounts` billing resource. |
| `src/services/ARM/armFetch.ts` | Low-level ARM HTTP wrapper (`armRequest`, `ArmError`, `ARM_BASE_URL`). |
| `src/services/ARM/diagnoseArmError.ts` | ARM error classifier (policy / RBAC / region / duplicate account / SPO link). |
| `src/services/Auth/VSCodeAuthProvider.ts` | Base auth provider using VS Code's auth API. |
| `src/services/Auth/GraphAuthProvider.ts` | Graph auth. `https://graph.microsoft.com/.default`. |
| `src/services/Auth/ARMAuthProvider.ts` | ARM auth. `https://management.azure.com/.default`. Acquired lazily by `armFetch`. |
| `src/services/Auth/AppAuthProviderFactory.ts` | Factory for per-3P-app delegated providers (Postman export, etc.). |
| `src/services/AuthenticationState.ts` | Centralized auth state management. |
| `src/services/UriHandler.ts` | `vscode://` deep-link handler (tenant + container-type targeting). |
| **Schemas** | |
| `src/models/schemas/container.ts` | Container Zod schemas. |
| `src/models/schemas/containerType.ts` | Container type schema — includes `billingClassification` (`trial`/`standard`/`directToCustomer`) and `billingStatus`. |
| `src/models/schemas/containerTypeRegistration.ts` | Registration schema — per-tenant `billingStatus`. |
| `src/models/schemas/user.ts` | Tenant user schema (owner picker). |
| `src/models/schemas/index.ts` | Barrel exports for all schemas. |
| **Tree views** | |
| `src/views/treeview/development/DevelopmentTreeViewProvider.ts` | Main tree view — call `.refresh()` after data changes. |
| `src/views/treeview/development/ContainerTypeTreeItem.ts` | CT row — composes the contextValue suffixes (`-trial`, `-standard-paid`, `-directToCustomer`, `-billingInvalid`, etc.). |
| `src/views/treeview/development/LocalRegistrationTreeItem.ts` | Registration row — per-tenant `-billingInvalid` evaluation. |
| `src/views/treeview/development/BillingDecorationProvider.ts` | `FileDecorationProvider` for the yellow ⚠ tint + `blockBillingInvalid` helper. |
| `src/views/treeview/development/ContainerTreeItem.ts` | Individual container row. |
| `src/views/treeview/development/ContainersTreeItem.ts` | Containers folder. |
| `src/views/treeview/development/IDataProvidingTreeItem.ts` | Base class for tree items with children. |
| `src/views/notifications/ProgressWaitNotification.ts` | Progress notification helper. |
| `package.json` | Extension manifest — command declarations, menu bindings, `when` clauses. |
| `.vscode/launch.json` | Debug configurations (Run Extension, Extension Tests). |
| `CLAUDE.md` | Project-wide architecture and convention notes for AI assistants and humans. |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **SharePoint Embedded (SPE)** | A Microsoft 365 platform for building file/document management apps backed by SharePoint storage. |
| **Container Type** | A template that defines a category of storage containers. Created by tenant admins. Has a billing classification (`trial`, `standard`, or `directToCustomer`). |
| **Billing Classification** | One of `trial`, `standard`, `directToCustomer`. Set at CT creation, immutable afterward. Drives which billing setup path applies. |
| **Standard CT** | Owner-org-billed. Usage costs are charged to the org that owns the CT's owning app. Requires Azure billing setup (`Microsoft.Syntex/accounts`). |
| **Direct-to-Customer (DTC) CT** | User-org-billed. Usage costs are charged per consuming tenant. A Global Admin in the user org sets up pay-as-you-go for SharePoint Embedded in the Microsoft 365 admin center. |
| **Microsoft.Syntex** | Azure resource provider that backs SPE billing. Must be `Registered` on the subscription before a billing account can be created. |
| **Syntex Billing Account** | A `Microsoft.Syntex/accounts` ARM resource whose **name is the container-type ID**. Ties a Standard CT to a subscription/resource group for billing. |
| **ARM** | Azure Resource Manager. Base URL `https://management.azure.com`. Reached via the `https://management.azure.com/.default` delegated scope. |
| **`-billingInvalid` suffix** | `contextValue` qualifier set when billing isn't usable for a CT (Standard: no Syntex account / not Registered; DTC: tenant pay-as-you-go not configured). Drives the ⚠ decoration, hides container ops, and exposes the **Attach billing…** menu item. |
| **Attach Billing** | The retry path. Context-menu command on a `-billingInvalid` CT or registration; re-enters the appropriate billing flow based on classification. |
| **Container** | An instance of a Container Type. Holds files and documents. Has permissions, custom properties, and versioning settings. |
| **Owning App** | The Entra ID (Azure AD) application registration that owns a Container Type. Has full control. |
| **Guest App** | An additional application registration granted permission to access a Container Type's containers. |
| **Registration** | The act of registering a Container Type on a specific tenant, which enables creating containers of that type on that tenant. |
| **Delegated Auth** | API calls made on behalf of the signed-in user. The user's permissions determine what the call can do. |
| **App-Only Auth** | API calls made as the application itself (no user context). Uses a client secret or certificate. Not used anywhere in this extension — listed for context when reading external SPE docs that mention it. |
| **1P App (First-Party)** | The extension's own Entra ID application registration. It's a public client (no secret). Used for sign-in. |
| **3P App (Third-Party)** | The developer's application registration (owning app or guest app). May have secrets/certs. |
| **Graph API** | Microsoft Graph — the unified API for Microsoft 365 services. Base URL: `https://graph.microsoft.com`. |
| **Entra ID** | Microsoft's identity platform (formerly Azure Active Directory / Azure AD). |
| **MSAL** | Microsoft Authentication Library. This extension does **not** import MSAL directly — VS Code's built-in Microsoft authentication provider sits on top of MSAL and handles token acquisition for us. |
| **PKCE** | Proof Key for Code Exchange — an OAuth 2.0 extension for public clients. Handled inside VS Code's auth provider; no PKCE code in this extension. |
| **JWT** | JSON Web Token — the format of access tokens. Contains claims like `tid` (tenant), `wids` (roles). |
| **Extension Host** | The VS Code process where extensions run. Separate from the VS Code UI process. |
| **Extension Development Host** | A second VS Code window launched during debugging that has your extension loaded for testing. |
| **Context Value** | A string set on tree items (`contextValue`) used in `when` clauses to control which menu items appear. |
| **Zod** | A TypeScript-first schema validation library. Used for runtime type checking of API responses. |
| **`beta` vs `v1.0`** | Microsoft Graph API versions. Container APIs use `beta`. Application APIs use `v1.0`. |
| **ETag** | An entity tag for optimistic concurrency control. Some update operations require passing the current ETag. |
