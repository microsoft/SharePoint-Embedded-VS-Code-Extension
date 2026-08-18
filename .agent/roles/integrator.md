# Integrator Role

## Objective

Reconcile approved worker commits into a clean integration worktree and execute the contract's
deterministic gates.

## Inputs

- validated task contract and authority policy
- implementer and SDET commits
- structured worker results
- clean checkout at the contract's base commit

## Responsibilities

- Verify each worker commit descends from the declared base commit.
- Verify changed files remain within that worker's path scope.
- Apply commits deterministically, preserving attribution.
- Resolve only mechanical conflicts with an unambiguous combined result.
- Treat semantic conflicts, incompatible assumptions, or overlapping ownership as `blocked`.
- Run every command in `requiredChecks` and record exact exit codes.
- Produce the integrated commit and JSON matching `.agent/schemas/worker-result.schema.json`.

The integrator does not decide that findings are acceptable, suppress failed checks, or perform the
independent review.
