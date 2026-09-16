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

The extension is desktop-only today:

- `package.json` has a Node entry point in `main`, but no `browser` entry point.
- The desktop bundle uses CommonJS and `platform=node`.
- `src/extension.ts` eagerly imports and registers 47 commands. Any Node-only
  import reachable from one command prevents the complete browser bundle.
- A baseline esbuild run with `platform=browser` fails on 13 unresolved Node
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

1. Add a minimal web entry point, dual esbuild configuration, and a local
   `@vscode/test-web` smoke test.
2. Split command registration into common and desktop-only capabilities until
   the browser bundle loads.
3. Prove Microsoft sign-in and a single Graph request on vscode.dev.
4. Prove container type and container listing.
5. Prove Storage Browser list, download, upload-session, and external-open
   operations, recording CORS behavior for every endpoint.
6. Decide which local-machine workflows remain desktop-only and hide their
   menus in web environments.
7. Add browser CI only after the authentication and network go/no-go gates pass.

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

