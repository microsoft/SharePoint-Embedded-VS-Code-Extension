import assert from 'node:assert/strict';
import test from 'node:test';
import { issueClient, reviewRevision, TITLE_PREFIX } from './feature-issue.mjs';
import { classifyFailure, parseReadiness, prepareReview, publishReview, reviewPrompt } from './review-feature.mjs';

const issue = {
    id: 100, number: 8, title: `${TITLE_PREFIX} Preserve selected rows`, state: 'open',
    body: '### Problem\nUsers lose their selection on refresh.\n### Expected behavior\nRestore selection.\n' +
        '### Acceptance criteria\n- Preserve selection.\n### UI impact\nKeep the selected row highlighted.',
    labels: [{ name: 'enhancement' }],
};

function fixture(first) {
    let current = structuredClone(first);
    const comments = [];
    const writes = [];
    const github = issueClient({ issue }, { GITHUB_REPOSITORY: 'owner/repo', GH_TOKEN: 'mock' }, async (url, init) => {
        const path = new URL(url).pathname;
        if (init.method === 'GET') return Response.json(path.endsWith('/comments') ? comments : current);
        writes.push([init.method, path]);
        if (path.endsWith('/labels')) {
            current.labels.push({ name: 'needs-info' });
            return Response.json(current.labels);
        }
        if (path.endsWith('/labels/needs-info')) {
            current.labels = current.labels.filter(({ name }) => name !== 'needs-info');
            return new Response(null, { status: 204 });
        }
        const { body } = JSON.parse(init.body);
        if (init.method === 'POST' && path.endsWith('/issues/8/comments')) {
            const comment = { id: 1, user: { id: 41898282, type: 'Bot' }, body };
            comments.push(comment);
            return Response.json(comment);
        }
        assert.equal(init.method, 'PATCH');
        assert.equal(path, '/repos/owner/repo/issues/comments/1');
        comments[0].body = body;
        return Response.json(comments[0]);
    });
    return { github, writes, comments, get current() { return current; }, set current(value) { current = value; } };
}

const moreContext = { gap: 'The form is incomplete.', why: 'A developer cannot infer the intended outcome.',
    add: 'Describe who encounters the problem and what should happen.', example: 'Show a notice after creation succeeds.' };
const pass = () => parseReadiness('{"checks":[],"questions":[]}');
const verdict = (plan, checks, questions = []) =>
    parseReadiness(JSON.stringify({ checks, questions }), plan.input.findings);

test('an incomplete request gets one comment, then semantic questions, then a readiness pass after edits', async () => {
    const f = fixture({ ...issue, body: null });
    const incompletePlan = await prepareReview(f.github);
    assert.equal(incompletePlan.kind, 'model');
    assert.equal(incompletePlan.input.findings.length, 4);
    const checks = incompletePlan.input.findings.map(({ id, gap, why, add, example }) =>
        ({ id, feedback: { gap, why, add, example } }));
    await publishReview(f.github, incompletePlan, { ...verdict(incompletePlan, checks), model: 'gpt-6.2-sol' });
    assert.match(f.comments[0].body, /Please address these points/);
    assert.match(f.comments[0].body, /Describe who encounters the problem/);
    assert.match(f.comments[0].body, /testable acceptance criteria/);
    assert.match(f.comments[0].body, /model setting: `gpt-6.2-sol`/);
    await publishReview(f.github, await prepareReview(f.github));
    assert.equal(f.writes.length, 2);

    f.current.body = issue.body;
    const modelPlan = await prepareReview(f.github);
    assert.equal(modelPlan.kind, 'model');
    assert.match(reviewPrompt(modelPlan.input), /untrusted requirements data/);
    const questions = verdict(modelPlan, [], [{
        field: 'Expected behavior', gap: 'No outcome is stated when the selected item has disappeared.',
        why: 'The developer cannot tell whether to clear selection or select another row.',
        add: 'Say what should happen after refresh if the selected item is missing.',
        example: 'Clear selection and leave the refreshed list visible.',
    }]);
    await publishReview(f.github, modelPlan, { ...questions, model: 'gpt-6.2-sol' });
    assert.match(f.comments[0].body, /selected item has disappeared/);
    assert.match(f.comments[0].body, /Why it matters:.*cannot tell/);
    assert.match(f.comments[0].body, /What to add:.*after refresh/);
    assert.match(f.comments[0].body, /Clear selection and leave the refreshed list visible/);
    assert.match(f.comments[0].body, /model setting: `gpt-6.2-sol`/);
    assert.equal(f.comments.length, 1);
    await publishReview(f.github, await prepareReview(f.github));
    assert.equal(f.writes.length, 3);

    f.current.body = issue.body.replace('Restore selection.', 'Restore selection only when the item is still present; otherwise clear it.');
    await publishReview(f.github, await prepareReview(f.github), pass());
    assert.ok(f.comments[0].body.startsWith(`<!-- spe-feature-readiness:v1 ${reviewRevision(f.current)} ready -->`));
    assert.match(f.comments[0].body, /Ready for `agent-ready` \(awaiting maintainer approval\)/);
    assert.equal(f.comments.length, 1);
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
});

test('a stale result cannot overwrite feedback and an unavailable review can be retried', async () => {
    const f = fixture(issue);
    const plan = await prepareReview(f.github);
    f.current.body += '\nEdited.';
    const stale = await publishReview(f.github, plan, pass());
    assert.match(stale.message, /no stale review/);
    assert.equal(f.writes.length, 0);
    const next = await prepareReview(f.github);
    f.current.labels.push({ name: 'needs-info' });
    const runUrl = 'https://github.com/owner/repo/actions/runs/123';
    const outcome = await publishReview(f.github, next, { status: 'unavailable', feedback: [], failure: 'credential' }, { runUrl });
    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.failure, 'credential');
    assert.match(f.comments[0].body, /no author action required/);
    assert.match(f.comments[0].body, /credential is missing, expired, or was rejected/);
    assert.equal(f.comments[0].body.match(/\[Actions run\]\(([^)\r\n]+)\)/)?.[1], runUrl);
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
    assert.equal((await prepareReview(f.github)).kind, 'model');
});

test('Copilot can drop an advisory finding when the full issue already answers it', async () => {
    const f = fixture({ ...issue, title: `${TITLE_PREFIX} Confirm container creation`,
        body: '### Problem\nThe New Container dialog closes. We want a notice above the list only after creation succeeds.\n' +
            '### Expected behavior\nShow a notification when I create a container.\n' +
            '### Acceptance criteria\n- The notification works.\n### UI impact\nA notification appears.' });
    const plan = await prepareReview(f.github);
    assert.equal(plan.kind, 'model');
    assert.match(plan.input.description, /above the list only after creation succeeds/);
    const [criterion, timing, placement] = plan.input.findings;
    assert.equal(criterion.required, true);
    assert.equal(timing.required, false);
    assert.equal(placement.required, false);
    assert.throws(() => verdict(plan, [
        { id: criterion.id, feedback: moreContext }, { id: timing.id, feedback: null }, { id: timing.id, feedback: null },
    ]));
    const model = verdict(plan, [
        { id: criterion.id, feedback: { gap: 'The success notification criterion is not observable.',
            why: 'A tester could not tell whether the notification passes.',
            add: 'Name the test container and tell the tester what text to expect.',
            example: 'After creating Demo, expect Container Demo created successfully above the list.' } },
        { id: timing.id, feedback: null },
        { id: placement.id, feedback: { gap: 'The notification wording is not yet specified.',
            why: 'Placement is clear, but the tester still needs expected text.',
            add: 'Give an example of its text.', example: 'Container Demo created successfully.' } },
    ]);
    const outcome = await publishReview(f.github, plan, { ...model, model: 'gpt-6.2-sol' });
    assert.equal(outcome.status, 'needs-info');
    assert.match(f.comments[0].body, /criterion is not observable/);
    assert.doesNotMatch(f.comments[0].body, /\*\*Expected behavior\*\*/);
    assert.match(f.comments[0].body, /example of its text/);
    assert.match(f.comments[0].body, /Container Demo created successfully/);
    assert.match(f.comments[0].body, /model setting: `gpt-6.2-sol`/);
    assert.ok(f.current.labels.some(({ name }) => name === 'needs-info'));
});

test('the model must account for all findings exactly once and retain required corrections', async () => {
    const f = fixture({ ...issue, title: `${TITLE_PREFIX} Confirm container creation`,
        body: '### Problem\nCreation is unconfirmed.\n### Expected behavior\nShow a notice only after create succeeds.\n' +
            '### Acceptance criteria\n- The notification works.\n### UI impact\nShow a dismissible notice above the container list.' });
    const plan = await prepareReview(f.github);
    assert.equal(plan.kind, 'model');
    assert.deepEqual(plan.input.findings.map(({ field }) => field), ['Acceptance criteria']);
    const [finding] = plan.input.findings;
    assert.throws(() => verdict(plan, []));
    assert.throws(() => verdict(plan, [{ id: finding.id, feedback: null }]));
    assert.throws(() => verdict(plan, [{ id: finding.id + 1, feedback: moreContext }]));
    assert.throws(() => verdict(plan, [{ id: finding.id, feedback: moreContext }, { id: finding.id, feedback: moreContext }]));
});

test('failed Copilot review keeps required form corrections but does not present advisory findings as facts', async () => {
    const f = fixture({ ...issue, title: `${TITLE_PREFIX} Confirm container creation`,
        body: '### Problem\nCreation is unconfirmed.\n### Expected behavior\nShow a notification.\n' +
            '### Acceptance criteria\n- The notification works.\n### UI impact\nA notification appears.' });
    const plan = await prepareReview(f.github);
    const outcome = await publishReview(f.github, plan, { status: 'unavailable', failure: 'service' });
    assert.equal(outcome.status, 'unavailable');
    assert.match(f.comments[0].body, /Copilot has not reviewed them/);
    assert.match(f.comments[0].body, /observable result/);
    assert.doesNotMatch(f.comments[0].body, /notification needs a testable placement/);
    assert.ok(f.current.labels.some(({ name }) => name === 'needs-info'));
});

test('an older needs-info comment is reviewed again rather than cached', async () => {
    const f = fixture(issue);
    f.comments.push({ id: 1, user: { id: 41898282, type: 'Bot' },
        body: `<!-- spe-feature-readiness:v1 ${reviewRevision(issue)} needs-info -->\nOld feedback.` });
    const plan = await prepareReview(f.github);
    assert.equal(plan.kind, 'model');
    await publishReview(f.github, plan, { ...pass(), model: 'gpt-6.2-sol' });
    assert.deepEqual(f.writes, [['PATCH', '/repos/owner/repo/issues/comments/1']]);
    assert.match(f.comments[0].body, /Ready for `agent-ready`/);
});

test('reviewer diagnostics classify errors without propagating raw SDK text', () => {
    assert.equal(classifyFailure(new Error('HTTP 401 with private details'), 'service'), 'credential');
    assert.equal(classifyFailure(new Error('model missing'), 'model'), 'model');
    assert.equal(classifyFailure(new Error('SDK protocol version mismatch: unsupported version'), 'startup'), 'protocol');
    assert.equal(classifyFailure(new Error('timed out'), 'service'), 'service');
    assert.deepEqual(parseReadiness('```json\n{"checks":[],"questions":[]}\n```'), { status: 'ready', feedback: [] });
});

test('malformed or unsafe model output never becomes a readiness verdict', () => {
    const feedback = { field: 'Problem', gap: 'Missing context', why: 'Impact is unclear',
        add: 'Say what blocks the user', example: 'Developers cannot finish creating a container' };
    for (const output of ['{"checks":[],"questions":null}', '{"checks":[],"questions":[],"approved":true}',
        ...[
            { field: 'Problem', question: 'Please clarify.' },
            { ...feedback, field: 'Other' },
            { ...feedback, example: 'Contact @someone.' },
            { ...feedback, add: 'Go to https://example.com' },
        ].map(item => JSON.stringify({ checks: [], questions: [item] }))]) {
        assert.throws(() => parseReadiness(output));
    }
});

test('readiness ignores superseded events and never adds agent-ready for the issue author', async () => {
    const user = { id: 123, login: 'maintainer', type: 'User' };
    const initial = { ...issue, user };
    const event = { action: 'edited', issue: initial, sender: user };
    const f = fixture(initial);
    assert.equal((await prepareReview(f.github, { ...event, issue: { ...initial, body: 'Old draft' } })).kind, 'ignored');
    const plan = await prepareReview(f.github, event);
    await publishReview(f.github, plan, pass());
    await publishReview(f.github, await prepareReview(f.github, event));
    assert.deepEqual(f.writes, [['POST', '/repos/owner/repo/issues/8/comments']]);
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
});
