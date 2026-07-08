# Storage Explorer tests (Playwright)

Three complementary suites that exercise the SharePoint Embedded **Storage Explorer** webview
against a mocked Microsoft Graph (deterministic, no tenant) — plus an optional live mode.

| Suite | Command | What it covers | Runtime |
|-------|---------|----------------|---------|
| **UI / E2E** | `npm run test:ui` | The real React UI driven in Chromium (Vite dev server): containers, files/folders, side panels, recycle bin, nav | ~35 s |
| **API-layer** | `npm run test:api` | Every `*GraphService` method's request shaping, in Node, against a fake Graph client (no browser) | ~2 s |
| **Perf** | `npm run test:perf` | Enumeration-list render benchmark at 100/500/1000/5000 against a **production** build | ~30 s |

> The webview's only VS Code coupling is a token bridge, so the tests inject panel state + a token
> bridge shim and drive the real app — no VS Code needed. (Driving the *real VS Code app* with
> Playwright is blocked on Windows by VS Code's self-relaunch; that's a separate, later phase.)

## Prerequisites

```powershell
npm install                       # adds @playwright/test; installs webview deps via postinstall
npx playwright install chromium   # one-time browser download
```

## UI / E2E suite (`npm run test:ui`)

Drives the standalone webview (Vite dev server auto-started by Playwright). Specs live in
`ui-tests/tests/` and use the `storage` fixture (injects state + token, installs the Graph mock,
navigates). Coverage:

- **containers** — create / rename / delete → deleted-containers → restore
- **files-folders** — navigate in, new folder, new Word doc, rename, delete, breadcrumb
- **search** — filter containers/files by name (incl. filtering 1000 containers to 1), empty state, reset on navigation
- **container-panels** — permissions / columns / metadata / settings tabs render seeded data
- **file-panels** — properties / versions / permissions tabs for a selected file
- **recycle** — item → container recycle bin → restore / permanent-delete
- **navbar** — tenant identity, network drawer, refresh

Watch it / slow-mo:

```powershell
$env:SPE_TEST_SLOWMO=1200; npm run test:ui                          # visible + slowed
npx playwright test -c ui-tests/playwright.config.ts --headed       # visible, full speed
npx playwright test -c ui-tests/playwright.config.ts --ui           # interactive
npm run test:ui:report                                              # open the HTML report
```

### Live mode (real tenant)

```powershell
Copy-Item ui-tests/.env.example ui-tests/.env
#   set SPE_TEST_ACCESS_TOKEN (a real Graph delegated token with FileStorageContainer.Selected)
#   and SPE_TEST_CONTAINER_TYPE_ID
npm run test:ui
```

Grab a token from [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) (consent
to `FileStorageContainer.Selected`, copy the Access token). Tokens expire in ~1 hour.

## API-layer suite (`npm run test:api`)

Fast Node tests (no browser) that import the real `webview-ui` `*GraphService` classes and assert
the exact request each method shapes — path, HTTP verb, `v1.0`, `$filter`/`$select`/`$expand`,
and body — via a fake fluent Graph client (`ui-tests/api/fakeClient.ts`). Covers
`ContainerGraphService` (14), `DriveGraphService` (18), `PermissionGraphService` (8),
`ColumnGraphService` (6), `PeopleGraphService` (3), `MeGraphService` (1).

## Perf suite (`npm run test:perf`)

Answers "does a large enumeration slow rendering?". Serves a **production** build of the webview
(`vite build` + `vite preview`) — not the dev server (which double-renders under StrictMode) — and
measures container enumeration at **100 / 500 / 1000 / 5000** with the Graph mock returning N
containers. Per size it captures render time (median), DOM node + row counts, JS heap,
layout/style-recalc cost (CDP), scroll FPS, and long-task time, then writes a report + verdict to
`ui-tests/perf/results/perf-report.md` (also echoed to the console).

Latest finding: the enumeration list is **virtualized** (`@tanstack/react-virtual`) — only ~40
rows are ever in the DOM regardless of N. Render stays low and scroll stays ~60 FPS through 5000
containers (5000: ~0.8 s render + 842 DOM nodes + 60 FPS, versus ~4 s + 90k nodes + 9 FPS before
virtualization).

## Layout

```
ui-tests/
  testids.ts                 # canonical data-testid strings (shared with webview components)
  playwright.config.ts       # UI/E2E: chromium + auto Vite dev server
  playwright.api.config.ts   # API-layer: node, no browser
  playwright.perf.config.ts  # Perf: prod build + vite preview
  config.ts                  # UI/E2E mock-vs-live config
  fixtures.ts                # `storage` fixture (inject state/token, mock, navigate)
  global.d.ts                # ambient window globals for the type-check
  helpers/
    token.ts                 # fake Graph JWT
    graphMock.ts             # installGraphMock() — intercepts all Graph traffic
    mock/state.ts            # in-memory Graph state (containers, items, perms, columns, …)
    mock/router.ts           # request → state routing (full endpoint surface)
  pages/StorageExplorerWebview.ts   # data-testid driven page object
  tests/                     # UI / E2E specs
  api/                       # API-layer specs + fakeClient.ts
  perf/                      # perf benchmark + measure.ts (+ results/, gitignored)
```
