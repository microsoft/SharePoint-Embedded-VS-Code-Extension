# vscode.dev Support Spike

## Goal

Determine whether the SharePoint Embedded extension can run as a VS Code web
extension on `vscode.dev`, while preserving the desktop extension and the
Storage Browser release path.

The spike branch is intentionally stacked on `aljordac/storage-browser`. This
keeps the Storage Browser available for the web investigation without coupling
its earlier release to the vscode.dev work.

## Working layout

| Purpose | Branch | Worktree |
| --- | --- | --- |
| Finish and release Storage Browser | `aljordac/storage-browser` | `SharePoint-Embedded-VS-Code-Extension` |
| Explore vscode.dev support | `aljordac/vscode-dev-spike` | `SharePoint-Embedded-VS-Code-Extension-vscode-dev` |

Both worktrees can stay open in separate VS Code windows. Changes and
dependencies are isolated by directory, while Git objects are shared.

The spike was created from Storage Browser commit `ecaa3a0`. Uncommitted files
in the Storage Browser worktree are not part of the spike until they are
committed and merged into the spike branch.

### Keeping the spike current before Storage Browser merges

From the vscode.dev worktree:

```powershell
git fetch origin
git merge aljordac/storage-browser
```

Prefer merging the parent branch into the spike while both branches are active.
This avoids rewriting a branch that may already be shared.

### Restacking after Storage Browser merges to `main`

First update the local parent branch and `main`. Then, from the vscode.dev
worktree, replay only the commits unique to the spike:

```powershell
git fetch origin
git rebase --onto origin/main aljordac/storage-browser aljordac/vscode-dev-spike
git push --force-with-lease
```

Using `--onto` is important if the Storage Browser pull request is squash
merged. A plain rebase could otherwise replay the Storage Browser commits that
are already represented by the squash commit on `main`.

## Current compatibility findings

The first spike milestone now provides:

- The existing Node entry point in `main` for desktop.
- A separate `browser` entry point backed by `src/extension.web.ts`.
- A browser bundle built with esbuild `platform=browser`.
- Web-host activation, storage initialization, account and development trees,
  Microsoft authentication state, and the sign-in, sign-out, switch-account,
  cancel-sign-in, and refresh commands.
- A dual-host packaging build that produces both `out/extension.js` and
  `out/extension.web.js`.

The browser bundle builds without unresolved Node built-ins. Desktop-only
commands are intentionally not imported by the web entry point yet. This is a
capability boundary for the spike, not the final web UX: menu contributions for
unavailable commands still need web-specific `when` clauses.

Before the split, `src/extension.ts` eagerly imported and registered 47 commands
and a baseline esbuild run with `platform=browser` failed on 13 unresolved Node
built-ins.

Known runtime blockers:

| Area | Current dependency | Web direction |
| --- | --- | --- |
| Build and activation | One Node/CommonJS entry point | Add a web-worker entry point and a browser bundle while retaining the desktop bundle |
| Telemetry identity hashing | Node `crypto.createHash` | Use Web Crypto or a runtime-neutral hashing helper; confirm telemetry package web support |
| Storage Browser CSP nonce | Node `crypto.randomBytes` | Use `globalThis.crypto.getRandomValues` |
| Storage Browser HAR export | `os`, `path`, `fs`, and `Uri.file` | Open an in-memory document or use a VS Code save dialog plus `workspace.fs` |
| Postman export | `fs` and `path` | Use `showSaveDialog` and `workspace.fs` |
| Sample app cloning | `child_process`, local Git, and local filesystem | Mark desktop-only or design a repository/remote-workspace alternative |
| Local admin consent | Local HTTP callback server | Replace with a browser-safe redirect/URI-handler flow or mark desktop-only |
| URL parsing | Node `url.URL` | Use the browser global `URL` |
| Command registration | Desktop and web capabilities are mixed | Split common, desktop-only, and web-safe command registration |

The existing authentication design is a positive starting point because it uses
`vscode.authentication` rather than directly using `@azure/msal-node`.
However, the custom Entra client ID, tenant targeting, `.default` scopes, and
account switching must be proven inside the vscode.dev Microsoft
authentication provider.

The highest technical risk is browser networking. In a web extension, Graph,
ARM, SharePoint download, and upload-session requests run in a browser worker
and are subject to CORS. The Storage Browser UI itself is already a webview, but
its host-side Graph and SharePoint requests currently run in Node and therefore
do not prove browser compatibility.

## Proposed spike sequence

1. Add web-specific menu capability gating for commands that are not registered
   by the browser entry point.
2. Provision the local client configuration in the spike worktree, then prove
   Microsoft sign-in and a single Graph request on vscode.dev.
3. Prove container type and container listing.
4. Prove Storage Browser list, download, upload-session, and external-open
   operations, recording CORS behavior for every endpoint.
5. Decide which local-machine workflows remain desktop-only and hide their
   menus in web environments.
6. Add browser CI only after the authentication and network go/no-go gates pass.

## Local testing

The public Marketplace version remains unavailable on vscode.dev until a
version containing the `browser` entry point is published. Local development
does not require publishing.

### Browser-hosted VS Code on localhost

The fastest feedback loop uses `@vscode/test-web`:

```powershell
npm run open:web
```

This builds `out/extension.web.js`, downloads VS Code web assets into
`.vscode-test-web`, starts a localhost server, opens Chromium, and opens browser
developer tools. The extension is loaded directly from this worktree.

The first run downloads VS Code and a browser runtime, so it is slower than
subsequent runs. The virtual workspace is backed by the local test server;
changes made to workspace files in the browser are kept in memory.

For source-level debugging without leaving desktop VS Code, select
**Run and Debug > Run Web Extension**. This starts the extension in VS Code's
web extension host with web-worker debugging enabled.

### Actual vscode.dev sideload

For a final environment check, host the extension worktree over local HTTPS
with CORS enabled. In vscode.dev run **Developer: Install Extension From
Location...** and enter the HTTPS localhost URL. The official flow uses
`mkcert` to create a trusted localhost certificate and `serve --cors` to host
the extension directory.

The normal Extensions view still describes the Marketplace release as
unavailable; that does not affect the separately sideloaded development
extension.

Do not disable browser web security for normal validation. The harness supports
that mode, but it bypasses the CORS behavior that is one of this spike's key
go/no-go questions.

## Estimate

Estimates assume one engineer familiar with this repository.

| Outcome | Effort | Includes |
| --- | ---: | --- |
| Technical go/no-go spike | 3-5 engineer days | Dual entry point, browser activation, auth proof, one Graph call, Storage Browser network/CORS probes |
| Useful web MVP | 10-15 engineer days | Resource browsing/management, Storage Browser core flows, capability gating, runtime-neutral utilities, targeted web tests |
| Broad desktop parity | 20-30 engineer days | Browser-safe replacements for exports and consent, deeper ARM and mutation coverage, CI/package hardening, UX and regression work |

The MVP estimate assumes sample-app cloning remains desktop-only. Recreating
that workflow for browser-hosted repositories would add roughly 5-10 engineer
days and may require a product decision about the target environment.

## Go/no-go criteria

Proceed beyond the spike only if all of these are demonstrated in the actual
web extension host:

- The extension activates on vscode.dev without Node polyfills for privileged
  APIs.
- Microsoft sign-in returns a usable Graph token for the configured client and
  tenant.
- Graph container-type and container requests succeed under browser CORS.
- Storage Browser list and file transfer endpoints succeed under browser CORS,
  or an acceptable service-side/proxy design is identified.
- Desktop-only commands can be hidden without breaking the core management
  experience.

## TODO prior to Marketplace release

- Validate the packaged extension in actual `vscode.dev`, including Microsoft
  sign-in, tenant and account switching, Graph container-type and container
  requests, and Storage Browser list, download, upload-session, and
  external-open operations. Record the CORS result for each endpoint.
- Add `spe:isWeb` menu conditions in `package.json` so desktop-only commands do
  not appear in web environments. Replace the temporary "not available in the
  vscode.dev spike yet" command handlers with final capability-specific UX.
- Decide and document the final web behavior for container-type creation and
  registration, billing attachment, Postman file export, local admin consent,
  sample-app cloning, and container creation. Implement browser-safe
  alternatives or explicitly keep each workflow desktop-only.
- Add browser-extension CI that builds `out/extension.web.js` and verifies
  activation in a web extension host. Existing type-check, lint, webview, API,
  and UI validation does not exercise the browser entry point.
- Make packaging reproducible by pinning `@vscode/vsce`, then create and inspect
  the VSIX and install-test it in both desktop VS Code and `vscode.dev`.
- Stop the local HTTPS server before running `npm run vscode:prepublish`.
  Serving `out/` can lock generated webview assets on Windows and prevent Vite
  from cleaning `out/webviewApp`.
- Reconcile the spike with the target release branch, commit all final changes,
  update release notes and the extension version, and complete independent
  review and CI validation before publishing.
