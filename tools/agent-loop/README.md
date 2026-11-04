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
