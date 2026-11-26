import { assessIssue, criterionScenarios, MAX_MODIFICATIONS } from './feature-issue.mjs';

const actions = new Map([
    ['assertion-failed', 'Reproduce the failed assertion, correct the discrepancy, and show this result'],
    ['not-implemented', 'Implement this missing behavior'],
    ['not-covered', 'Add focused regression coverage for this outcome'],
    ['fixture-unavailable', 'Supply an offline fixture that reproduces this case'],
    ['not-verifiable', 'Demonstrate this outcome with an observable assertion'],
    ['build-failed', 'Get this case compiling and running before assessing its behavior'],
    ['review-finding', 'Address the review finding against this requirement'],
    ['unresolved', 'Demonstrate this required outcome'],
]);

// Only reuse wording the author already supplied for this exact revision.
const plainLine = text => text.replace(/[`~]/g, "'").replace(/<!--/g, '(comment)').replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim();

export function modificationGuidance(issue, focus, diagnostic) {
    if (!focus) {
        // Older worker stops could identify the criterion but not the individual scenario.
        const parent = /^Feature agent stopped during (?:implementation|repass): (?:Implementation|Test) worker \((AC-\d{2,4}(?:, AC-\d{2,4})*)\) reported (?:blocked|failure): (?:implementation-incomplete|missing-context|fixture-unavailable)\./.exec(diagnostic ?? '');
        if (!parent) return '';
        focus = parent[1].split(', ').map(id => `${id}=unresolved`).join(',');
    }
    if (typeof focus !== 'string' || focus.length > 2048) return '';
    const brief = assessIssue(issue);
    if (brief.status !== 'complete') return '';
    const catalog = new Map();
    brief.criteria.forEach((text, index) => {
        const id = `AC-${String(index + 1).padStart(2, '0')}`;
        const parts = criterionScenarios(id, text);
        catalog.set(id, { text, parts });
        for (const s of parts) catalog.set(s.id, { text: s.description, parts: [] });
    });
    const changes = [], kept = [], targets = [];
    for (const token of new Set(focus.split(','))) {
        const [id, observation, ...extra] = token.split('=');
        const entry = catalog.get(id);
        if (!entry || extra.length || (!actions.has(observation) && observation !== 'verified')) return '';
        // These lines go in a fenced plain-text block within the managed delivery section.
        if (observation === 'verified') {
            kept.push(`Keep (${id}): ${plainLine(entry.text)}`);
        } else if (observation === 'unresolved' && entry.parts.length) {
            targets.push(id);
            changes.push(`Change (${id}): Cover these outcomes separately; the run did not identify which one was incomplete.\n` +
                entry.parts.map(part => `  - ${plainLine(part.description)}`).join('\n'));
        } else {
            targets.push(id);
            changes.push(`Change (${id}): ${actions.get(observation)}: ${plainLine(entry.text)}`);
        }
    }
    if (!changes.length) return '';
    const lines = kept.length ? kept.slice(0, 3) : [`Keep: Leave behavior outside ${targets.join(', ')} unchanged.`];
    let omitted = 0;
    for (const change of changes) {
        if ([...lines, change].join('\n').length <= MAX_MODIFICATIONS) lines.push(change);
        else omitted++;
    }
    return ['**Suggested follow-up from this run**',
        'If you want to revise an earlier reviewed proposal, paste or adapt this under **Modifications**. Otherwise use it as a repair plan; you do not need to rewrite the original brief.',
        '```text', ...lines, '```', ...(omitted ? [`${omitted} additional target(s) are in the run diagnostic.`] : [])].join('\n');
}
