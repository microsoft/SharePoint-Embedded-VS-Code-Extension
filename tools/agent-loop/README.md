# Agent Loop Runner

This runner executes the repository contracts under `.agent/` with isolated Copilot worker contexts.
It is intentionally repository-specific and stops at a local integration branch awaiting human
acceptance.

Each worker is bound to a programmatic-only custom agent under `.github/agents/`. The runner passes
that profile to an isolated `@github/copilot-sdk` session and refuses to start if the profile is
absent from the pinned base commit.

## Commands

```text
npm run agent:validate -- .agent/contracts/examples/storage-explorer-bulk-restore.json
npm run agent:plan -- .agent/contracts/examples/storage-explorer-bulk-restore.json
npm run agent:run -- .agent/contracts/examples/storage-explorer-bulk-restore.json
```

`validate` checks the JSON schema, role graph, path isolation, authority policy, and required command
allow-list. `plan` also resolves the base commit and prints the execution topology without invoking
an agent. `run` performs the bounded delivery loop.

## Execution Model

1. Resolve and pin the contract's base commit.
2. Run SDK preflight before creating any worktree.
3. Create separate implementer and SDET worktrees and invoke Copilot SDK sessions.
4. Capture SDK events and worker results under `.agent-runs/<task>/<run>/`.
5. Reject changed files outside the global and worker path scopes.
6. Create attributed worker commits after path enforcement.
7. Cherry-pick worker commits into a clean integration branch.
8. Run every required deterministic check.
9. Invoke an independent reviewer in a read-only checkout.
10. Dispatch bounded repass workers when checks or review findings require changes.
11. Stop at `awaiting-human-acceptance`; never push or merge.

Worktrees are created under the system temporary directory to avoid Windows path-length failures.
Set `AGENT_LOOP_WORKTREE_ROOT` to use a different short absolute path. Worktrees are retained so
failures can be inspected, and their paths are recorded in `run.json`.

## Copilot SDK Runtime

The SDK is the only worker runtime. Each invocation creates one isolated SDK client and session,
connected to the installed native Copilot executable as its JSON-RPC server. On Windows this must
be a native `copilot.exe`; PowerShell and batch shims cannot host the server. Set
`AGENT_LOOP_COPILOT_COMMAND` to an absolute executable path when it is not discoverable.

Before any worktree is created, preflight verifies the SDK package, executable, authentication,
custom-agent profiles, requested model and reasoning effort, and the runtime's canonical built-in
tools. Read-only workers receive only `view`, `grep`, and `glob`; mutable workers additionally
receive `create` and `edit`.

The SDK streams session, tool, sub-agent, completion, error, and permission-decision events directly
into each worker evidence log. A default-deny permission callback rejects shell, URL, MCP, memory,
extension, factory, hook, schedule, sandbox-bypass, managed-approval, out-of-worktree reads, and
writes outside both contract and worker path scopes. Memory, cross-session storage, extensions,
schedules, skills, file hooks, host Git operations, remote sessions, MCP servers, and SDK session
telemetry are disabled. Embedding retrieval is disabled and any embedding cache is memory-only so
worker contexts cannot leak through shared retrieval state.

Leaf workers do not receive shell execution. This fail-closed design keeps the workflow usable on
Windows hosts where the preview local sandbox is unavailable without disabling sandbox protections.
The runner owns dependency provisioning, Git mutations, and deterministic validation. Changed paths
are checked after every invocation before the runner creates a commit.

Optional environment variables:

- `AGENT_LOOP_COPILOT_COMMAND`: native Copilot executable path; defaults to `copilot`.
- `AGENT_LOOP_MODEL`: model passed to each worker.
- `AGENT_LOOP_REASONING_EFFORT`: reasoning effort; defaults to `high` for models that advertise
  reasoning support and is omitted for `auto` or non-reasoning models.
- `AGENT_LOOP_WORKTREE_ROOT`: short directory used for isolated worktrees.

Run `npm run agent:test:sdk-smoke` to execute the optional real-runtime preflight smoke test. Set
`AGENT_LOOP_RUN_SDK_SMOKE=1` to enable it; normal unit tests use mocked SDK clients.

## Evidence

Each run retains:

- the immutable contract and policy snapshot;
- `run.json` state transitions;
- worker prompts, incremental SDK events, SDK/session metadata, stderr, structured results, and commits;
- validation logs and exit codes;
- reviewer findings and repass results;
- the final local integration branch and commit.

Raw logs are evidence, not the human review surface. `run.json`, validation results, and the final
review result are the synthesized handoff.

## GitHub feature requests

Use the [SPE feature request form](../../.github/ISSUE_TEMPLATE/feature-request.yml) with the title
`Feature-Request: SPE VSC Extension - <feature name>`. The
[intake workflow](../../.github/workflows/feature-intake.yml) triages opened, edited, and reopened
requests. It checks the form, then uses a text-only Copilot session to look for ambiguity and
missing verification details. It adds `needs-info` and keeps one bot comment with specific
questions. Reply by editing the issue description rather than in a comment. Each content revision
is reviewed until it passes, at which point the workflow clears `needs-info`. If the model is
unavailable or returns invalid output, readiness remains blocked; rerun triage to retry.

When the current revision passes, the bot comment says **Ready for `agent-ready` (awaiting
maintainer approval)**. Implementation never starts from readiness review alone, regardless of
who filed the issue. An approved maintainer must apply `agent-ready` to start implementation.
Editing the issue invalidates the previous readiness result. After an edit or failed run, wait for
readiness and remove and reapply `agent-ready` if it is already present.

To enable the workflow on the default branch, create the `needs-info` and `agent-ready` repository
labels and set the repository Actions variable `FEATURE_REQUEST_APPROVERS` to the approved GitHub
usernames (comma-separated). Create the `feature-agent` Actions environment, restrict deployments
to the default branch, and add `COPILOT_GITHUB_TOKEN` as an environment secret. Use an
organization-approved Copilot CLI credential with only
Copilot Requests access and no repository write grants. Do not copy private material into the
public issue form. No Azure service connection or private repository is required.

The pilot can edit selected webview, utility, localization, and test files; maintainers should route
changes to auth, Graph/RPC, dependencies, and CI manually. Validation runs in offline containers
without Actions or Copilot credentials. A separate job applies the review patch to a temporary Git
index without executing it, checks the changed paths and file modes, and opens one draft PR per issue
from `feature-agent/issue-<number>`. It never overwrites an existing branch or merges a PR. The
review patch and base SHA are also available in the Actions run.

Feature runs default to `gpt-6.2-sol`. Set the repository Actions variable `AGENT_LOOP_MODEL`
to another model ID available to the configured Copilot account, or to `auto` to let Copilot
select a model. `auto` does not guarantee the newest model. Set `AGENT_LOOP_REASONING_EFFORT`
only with an explicit model that supports the requested level. A run stops in preflight if its
configured model is missing or disabled.

The run builds `spe-issue-<number>-<commit>-testable.vsix` from the reviewed code in an offline,
credential-free container. Download the VSIX and SHA-256 file from **Actions → Feature Request
Intake → run → Artifacts**. The package uses the Marketplace extension ID; test in an isolated
VS Code profile or extension directory to avoid replacing your usual installation. Without an
approved public test application client ID in `SPE_TEST_CLIENT_ID`, the package is for install
and UI smoke testing only; live sign-in is not configured. Never put a client secret into
`SPE_TEST_CLIENT_ID` or use production credentials with generated code.

Enable **Allow GitHub Actions to create and approve pull requests** in **Settings > Actions >
General > Workflow permissions** if repository and organization policy permit it. Keep the default
workflow token read-only; the publisher requests write permissions for its own job only. The
workflow does not approve PRs. GitHub may require a maintainer to approve PR workflows started by
`GITHUB_TOKEN`. The testable VSIX is not a Marketplace release. Screenshot capture is not wired.
