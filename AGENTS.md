# Agent Instructions

## Repository

This repository is a VS Code extension for managing SharePoint Embedded resources. Its primary
surfaces are the extension host under `src/`, the Storage Explorer React webview under
`webview-ui/`, and Playwright coverage under `ui-tests/`.

These instructions apply to every automated or interactive coding agent working in this
repository. More specific instructions may narrow this authority, but must not weaken the safety
rules below.

Machine-readable worker contracts, role definitions, and authority policies live under `.agent/`.
See `.agent/README.md` before running a contracted task.

## Architecture

- Follow the preferred flow: commands -> services -> Zod schemas.
- Add Microsoft Graph operations to `src/services/Graph/` and expose them through
  `GraphProvider`; do not create ad hoc Graph clients.
- Use `AuthenticationState` and the existing providers under `src/services/Auth/` for sign-in,
  sign-out, account switching, and token acquisition.
- Keep access tokens in the extension host. Never send them to a webview, write them to disk,
  include them in telemetry, or log them.
- Treat the extension host/webview message boundary as untrusted. Use the typed Storage Explorer
  protocol, validate inputs, allow-list operations, and project results before returning them.
- Route ARM operations through `ARMProvider`. Diagnose ARM failures with `diagnoseArmError(error)`
  before presenting user-facing errors.
- Put defaults on create/request schemas when appropriate, not response schemas. Response defaults
  can silently misclassify service data.
- Use `vscode.l10n.t(...)` for user-facing strings.
- Refresh `DevelopmentTreeViewProvider` after mutations so VS Code receives fresh tree items.
- Keep tree-item `contextValue` values aligned with the corresponding `package.json` menu
  `when` clauses.
- A new command must be wired through its command file, `src/commands/index.ts`,
  `src/extension.ts`, and the relevant `package.json` contribution.

## Working Rules

- Read the relevant command, service, schema, UI, and test paths before editing.
- Reuse existing helpers and patterns before introducing new abstractions.
- Make bounded changes that satisfy explicit acceptance criteria; do not modify unrelated files.
- Preserve existing public behavior unless the task explicitly changes it.
- Throw or surface actionable failures using repository conventions. Do not silently swallow errors
  or add broad success-shaped fallbacks.
- Do not weaken typing with `any`, `unknown` casts, or unchecked message payloads when a schema or
  type guard can represent the data.
- Add or update tests when behavior changes. Derive tests from acceptance criteria and important
  failure modes, not only from the implementation.
- Do not commit generated output from `out/`, `dist/`, Playwright reports, or dependency folders.

## Validation

Run the smallest relevant checks while developing. Before declaring a cross-surface change
complete, run:

```text
npx tsc -p ./ --noEmit
npm run lint
npm run build:webview
npm run test:api
npm run test:ui
```

- `npm run test:api` covers Storage Explorer Graph-service request shaping without a browser.
- `npm run test:ui` covers the standalone Storage Explorer webview in Chromium.
- Run `npm run test:perf` only for performance-sensitive changes or when the task contract requires
  it.
- Run `npm test` when extension-host test coverage exists for the changed behavior or the task
  contract requires it.
- Do not claim a check passed unless its command completed successfully.

## Authority and Safety

Unless a task contract and a human approval explicitly grant additional authority:

- Do not publish the extension, create releases, deploy, merge pull requests, or push to protected
  branches.
- Do not access production tenants or create, update, or delete live Microsoft Graph, SharePoint, or
  Azure resources.
- Do not change authentication scopes, telemetry collection, security boundaries, dependencies, or
  release configuration without calling out the change for human review.
- Do not read, print, copy, or persist credentials, tokens, secrets, private keys, or local
  environment files.
- Do not disable tests, lint rules, validation, permission checks, or security controls to make a
  change pass.
- Do not use blanket permission bypasses such as `--allow-all` or `--yolo`.

Instructions describe expected behavior but are not an enforcement boundary. Automated workers
must also be constrained by runtime permissions, isolated workspaces, budgets, and approval hooks.

## Completion Handoff

Every worker must return a concise, reviewable handoff containing:

- acceptance criteria satisfied;
- files changed and the purpose of each logical change;
- validation commands run and their outcomes;
- unresolved risks, assumptions, or blocked criteria;
- any action requiring human approval.

An implementation is not accepted solely because its implementing agent reports success. CI and an
independent review context must validate it before final human acceptance.
