import assert from 'node:assert/strict';
import test from 'node:test';
import { issueClient, reviewRevision, TITLE_PREFIX } from './feature-issue.mjs';
import { parseReadiness, prepareReview, publishReview, reviewPrompt } from './review-feature.mjs';

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
    assert.equal(f.comments.length, 1);
    assert.deepEqual(f.current.labels, [{ name: 'enhancement' }]);
});

test('a stale result cannot overwrite feedback and an unavailable review can be retried', async () => {
    const f = fixture(issue);
    const plan = await prepareReview(f.github);
    f.current.body += '\nEdited.';
    assert.match(await publishReview(f.github, plan, parseReadiness('{"questions":[]}')), /no stale review/);
    assert.equal(f.writes.length, 0);
    const next = await prepareReview(f.github);
    await publishReview(f.github, next, { status: 'unavailable', feedback: [] });
    assert.match(f.comments[0].body, /unavailable/);
    assert.equal((await prepareReview(f.github)).kind, 'model');
});

test('malformed or unsafe model output never becomes a readiness verdict', () => {
    for (const output of ['{"questions":null}', '{"questions":[],"approved":true}',
        '{"questions":[{"field":"Other","question":"Please clarify."}]}',
        '{"questions":[{"field":"Problem","question":"Contact @someone."}]}',
        '{"questions":[{"field":"Problem","question":"Go to https://example.com"}]}']) {
        assert.throws(() => parseReadiness(output));
    }
});
