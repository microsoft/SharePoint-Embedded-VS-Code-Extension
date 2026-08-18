# Agent Loop Runner

This runner executes the repository contracts under `.agent/` with isolated Copilot CLI contexts.
It is intentionally repository-specific and stops at a local integration branch awaiting human
acceptance.

Each worker is bound to a programmatic-only custom agent under `.github/agents/`. The runner passes
that profile through `copilot --agent` and refuses to start if the profile is absent from the pinned
base commit.

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
2. Create separate implementer and SDET worktrees and invoke Copilot CLI non-interactively.
3. Capture JSONL events and worker results under `.agent-runs/<task>/<run>/`.
4. Reject changed files outside the global and worker path scopes.
5. Create attributed worker commits after path enforcement.
6. Cherry-pick worker commits into a clean integration branch.
7. Run every required deterministic check.
8. Invoke an independent reviewer in a read-only checkout.
9. Dispatch bounded repass workers when checks or review findings require changes.
10. Stop at `awaiting-human-acceptance`; never push or merge.

Worktrees are created under the system temporary directory to avoid Windows path-length failures.
Set `AGENT_LOOP_WORKTREE_ROOT` to use a different short absolute path. Worktrees are retained so
failures can be inspected, and their paths are recorded in `run.json`.

## Copilot CLI Controls

The adapter uses prompt mode with JSONL output, autopilot continuation limits, AI-credit limits,
experimental OS-level command sandboxing, disabled built-in MCP servers, no remote control/export,
no interactive questions, denied URL access, denied shell execution, and scoped write permissions.

Leaf workers do not receive shell execution. This fail-closed design keeps the workflow usable on
Windows hosts where the preview local sandbox is unavailable without disabling sandbox protections.
The runner owns dependency provisioning, Git mutations, and deterministic validation. Changed paths
are checked after every invocation before the runner creates a commit.

Optional environment variables:

- `AGENT_LOOP_COPILOT_COMMAND`: Copilot CLI executable path; defaults to `copilot`.
- `AGENT_LOOP_MODEL`: model passed to each worker.
- `AGENT_LOOP_REASONING_EFFORT`: reasoning effort; defaults to `high`.
- `AGENT_LOOP_WORKTREE_ROOT`: short directory used for isolated worktrees.

## Evidence

Each run retains:

- the immutable contract and policy snapshot;
- `run.json` state transitions;
- worker prompts, JSONL events, stderr, structured results, and commits;
- validation logs and exit codes;
- reviewer findings and repass results;
- the final local integration branch and commit.

Raw logs are evidence, not the human review surface. `run.json`, validation results, and the final
review result are the synthesized handoff.
