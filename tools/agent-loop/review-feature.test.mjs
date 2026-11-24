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

test('an incomplete request gets one comment, then semantic questions, then a readiness pass after edits', async () => {
    const f = fixture({ ...issue, body: null });
    const staticPlan = await prepareReview(f.github);
    assert.equal(staticPlan.kind, 'static');
    await publishReview(f.github, staticPlan);
    assert.match(f.comments[0].body, /Please address these points/);
    assert.match(f.comments[0].body, /Describe the problem/);
    assert.match(f.comments[0].body, /testable acceptance criteria/);
    await publishReview(f.github, await prepareReview(f.github));
    assert.equal(f.writes.length, 2);

    f.current.body = issue.body;
    const modelPlan = await prepareReview(f.github);
    assert.equal(modelPlan.kind, 'model');
    assert.match(reviewPrompt(modelPlan.brief), /untrusted requirements data/);
    const questions = parseReadiness('{"questions":[{"field":"Expected behavior","question":"What should happen when the selected item has disappeared?"}]}');
    await publishReview(f.github, modelPlan, questions);
    assert.match(f.comments[0].body, /selected item has disappeared/);
    assert.equal(f.comments.length, 1);
    await publishReview(f.github, await prepareReview(f.github));
    assert.equal(f.writes.length, 3);

    f.current.body = issue.body.replace('Restore selection.', 'Restore selection only when the item is still present; otherwise clear it.');
    await publishReview(f.github, await prepareReview(f.github), parseReadiness('{"questions":[]}'));
    assert.ok(f.comments[0].body.startsWith(`<!-- spe-feature-readiness:v1 ${reviewRevision(f.current)} ready -->`));
    assert.match(f.comments[0].body, /Ready for `agent-ready` \(awaiting maintainer approval\)/);
    assert.equal(f.comments.length, 1);
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
});

test('a stale result cannot overwrite feedback and an unavailable review can be retried', async () => {
    const f = fixture(issue);
    const plan = await prepareReview(f.github);
    f.current.body += '\nEdited.';
    const stale = await publishReview(f.github, plan, parseReadiness('{"questions":[]}'));
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
    assert.ok(f.comments[0].body.includes(runUrl));
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
    assert.equal((await prepareReview(f.github)).kind, 'model');
});

test('a vague notification request gets concrete questions without invoking the model', async () => {
    const f = fixture({ ...issue, title: `${TITLE_PREFIX} Confirm container creation`,
        body: "### Problem\nI can't tell whether my container was created.\n### Expected behavior\nShow a notification when I create a container.\n" +
            '### Acceptance criteria\n- The notification works.\n### UI impact\nA notification appears.' });
    const plan = await prepareReview(f.github);
    assert.equal(plan.kind, 'static');
    const outcome = await publishReview(f.github, plan);
    assert.equal(outcome.status, 'needs-info');
    assert.match(f.comments[0].body, /observable result/);
    assert.match(f.comments[0].body, /fails or is canceled/);
    assert.match(f.comments[0].body, /example of its text/);
    assert.ok(f.current.labels.some(({ name }) => name === 'needs-info'));
});

test('reviewer diagnostics classify errors without propagating raw SDK text', () => {
    assert.equal(classifyFailure(new Error('HTTP 401 with private details'), 'service'), 'credential');
    assert.equal(classifyFailure(new Error('model missing'), 'model'), 'model');
    assert.equal(classifyFailure(new Error('SDK protocol version mismatch: unsupported version'), 'startup'), 'protocol');
    assert.equal(classifyFailure(new Error('timed out'), 'service'), 'service');
    assert.deepEqual(parseReadiness('```json\n{"questions":[]}\n```'), { status: 'ready', feedback: [] });
});

test('malformed or unsafe model output never becomes a readiness verdict', () => {
    for (const output of ['{"questions":null}', '{"questions":[],"approved":true}',
        '{"questions":[{"field":"Other","question":"Please clarify."}]}',
        '{"questions":[{"field":"Problem","question":"Contact @someone."}]}',
        '{"questions":[{"field":"Problem","question":"Go to https://example.com"}]}']) {
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
    await publishReview(f.github, plan, parseReadiness('{"questions":[]}'));
    await publishReview(f.github, await prepareReview(f.github, event));
    assert.deepEqual(f.writes, [['POST', '/repos/owner/repo/issues/8/comments']]);
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
});
