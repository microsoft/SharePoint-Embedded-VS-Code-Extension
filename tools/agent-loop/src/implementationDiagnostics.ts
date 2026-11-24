import type { ImplementationStage } from './orchestrator';

export function describeImplementationFailure(stage: ImplementationStage, error: unknown): string {
    const detail = error instanceof Error ? error.message : '';
    let reason = 'The agent could not complete this stage.';
    if (stage === 'copilot-preflight') {
        if (/protocol version mismatch/i.test(detail)) {
            reason = 'The pinned Copilot CLI and SDK are incompatible.';
        } else if (/authentication is unavailable|\b401\b|bad credentials/i.test(detail)) {
            reason = 'Copilot authentication failed. Check the feature-agent environment secret and account access.';
        } else if (/model .* (?:not available|disabled by policy|does not support)|AGENT_LOOP_REASONING_EFFORT/i.test(detail)) {
            reason = 'The configured Copilot model or reasoning effort is unavailable.';
        } else {
            reason = 'Copilot runtime preflight failed. Check the pinned CLI and SDK setup.';
        }
    } else if (/^Unable to provision (?:root|webview) dependencies/.test(detail)) {
        reason = 'A worktree could not install its locked dependencies from the runner cache.';
    } else if (/^Workers did not complete/.test(detail)) {
        reason = 'At least one worker reported that it was blocked or failed.';
    } else if (/^Copilot SDK worker .* requested denied authority:|^Worker changed paths outside its authority:/.test(detail)) {
        reason = 'A worker requested or made a change outside its allowed scope.';
    } else if (/^(?:SDK worker returned malformed JSON|SDK worker final response must be|SDK worker result failed structured validation)/.test(detail)) {
        reason = 'A worker did not return the required structured result.';
    } else if (/\b(?:ENOENT|EPERM|EACCES)\b[\s\S]*\brun\.json\.tmp\b/.test(detail)) {
        reason = 'The runner could not save the shared run record.';
    } else if (stage === 'contract') {
        reason = 'The workflow could not load the task contract or verify the pinned base.';
    }
    return `Feature agent stopped during ${stage}: ${reason}`;
}
