# Agent Delivery Contracts

This directory contains the repository-owned contracts for the Level 3 delivery loop. The
repository runner executes every role through `@github/copilot-sdk`; each invocation must obey the
same task contract, authority policy, output schema, and repository instructions.

The runner validates contracts, performs SDK preflight, creates isolated worktrees, captures
events, validates outputs, and stops at human acceptance.

## Directory Layout

```text
.agent/
|-- contracts/examples/       Example task contracts
|-- policies/                 Runtime authority envelopes
|-- roles/                    Independent worker instructions
`-- schemas/                  JSON schemas for contracts and results
```

Each worker also names a programmatic-only Copilot profile under `.github/agents/`. Profiles filter
the canonical SDK tools visible to that role; the SDK permission callback and authority policy
independently control which visible tools may execute.

All paths in contracts are repository-relative and use `/` separators on every operating system.

## Required Context Separation

- The implementer and SDET start from the same base commit in separate worktrees.
- The SDET receives the task contract and baseline source, not the implementer's conversation.
- The integrator receives worker commits and structured results. It must not silently resolve
  semantic conflicts.
- The reviewer runs in a separate, read-only context after integration and validation.
- A reviewer decision of `changes-required` creates a structured repass. It is not converted into
  an automatic retry without the finding rationale.
- No worker may approve or merge its own work.

## Contract Lifecycle

```text
contract
  -> implementer + sdet
  -> integrator
  -> required checks
  -> independent reviewer
  -> repass when required
  -> required checks
  -> human acceptance
```

The orchestrator must reject a contract that:

- does not validate against `schemas/task-contract.schema.json`;
- attempts to weaken `AGENTS.md` or the referenced authority policy;
- grants overlapping mutable workspaces to parallel workers;
- omits an independent reviewer;
- allows autonomous publishing, deployment, protected-branch pushes, or merging.

## Structured Outputs

- Implementer, SDET, and integrator outputs validate against
  `schemas/worker-result.schema.json`.
- Reviewer outputs validate against `schemas/review-result.schema.json`.
- Self-reported validation is evidence, not a gate. The integrator or CI reruns every command in
  `requiredChecks`.
- Run logs and artifacts are retained outside model session memory and attributed by `workerId`.

## Human Authority

Humans define or approve the contract, resolve escalations, accept policy exceptions, and make the
final merge decision. The delivery loop must stop at `awaiting-human-acceptance`.
