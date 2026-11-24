import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { githubActionsBotId, issueClient, sensitivePath } from './feature-issue.mjs';
import { requiresManualPublishing, reviewedDiff } from './publish-feature.mjs';

export function classifyFeatureHandoff(raw) {
    const files = reviewedDiff(raw);
    const reviewPaths = files.filter(file => file.executable || sensitivePath(file.path)).map(({ path }) => path);
    return { autoPublish: !files.some(requiresManualPublishing), reviewPaths };
}

export async function postFeatureHandoff(event, env, fetcher = fetch) {
    const github = issueClient(event, env, fetcher);
    if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || event.action !== 'labeled' || event.label?.name !== 'agent-ready') {
        throw new Error('Expected the approved feature run event.');
    }
    const files = JSON.parse(env.REVIEW_FILES || '[]');
    if (!Array.isArray(files) || files.length > 40 || files.some(file => typeof file !== 'string' || !/^[\w./?-]+$/.test(file))) {
        throw new Error('Invalid sensitive file list.');
    }
    const marker = `<!-- spe-feature-handoff:v1 ${env.GITHUB_RUN_ID} -->`;
    const repoUrl = `https://github.com/${env.GITHUB_REPOSITORY}`;
    const branch = `feature-agent/issue-${event.issue.number}`;
    const delivery = /^[1-9]\d*$/.test(env.DRAFT_PR_NUMBER ?? '') ? `Draft PR: [#${env.DRAFT_PR_NUMBER}](${repoUrl}/pull/${env.DRAFT_PR_NUMBER}).`
        : env.BRANCH_PUSHED === 'true' ? `Branch pushed: [\`${branch}\`](${repoUrl}/tree/${branch}). No draft PR was opened by this run.`
        : env.AUTO_PUBLISH === 'true' ? 'The publisher did not confirm a branch push. See the run for details.'
        : 'No branch was pushed automatically because the patch changes CI or build controls, or contains an unsupported file path or mode.';
    const body = [
        marker, '### Feature agent handoff', '',
        `Implementation produced a reviewed patch and testable VSIX. [Download them from the Actions run](${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}).`,
        '', delivery,
        ...(files.length ? ['', '**Sensitive or infrastructure files to review before merging or installing:**',
            ...files.map(file => `- \`${file}\``), ...(files.length === 40 ? ['- See the patch for the full file list.'] : [])] : []),
    ].join('\n');
    for (let page = 1; page <= 10; page++) {
        const comments = await github(`/comments?per_page=100&page=${page}`);
        const existing = comments.find(comment => comment.user?.id === githubActionsBotId && comment.user.type === 'Bot' &&
            comment.body?.split('\n', 1)[0] === marker);
        if (existing) {
            if (!Number.isSafeInteger(existing.id) || existing.id < 1) throw new Error('Invalid handoff comment ID.');
            if (existing.body !== body) await github('', { method: 'PATCH', commentId: existing.id, body: { body } });
            return;
        }
        if (comments.length < 100) {
            await github('/comments', { method: 'POST', body: { body } });
            return;
        }
    }
    throw new Error('Issue comment history exceeded the handoff limit.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'report') {
    await postFeatureHandoff(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), process.env);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { autoPublish, reviewPaths } = classifyFeatureHandoff(readFileSync(0, 'utf8'));
    const files = reviewPaths.slice(0, 40).map(path => path.replace(/[^\w./-]/g, '?'));
    appendFileSync(process.env.GITHUB_OUTPUT, `auto-publish=${autoPublish}\nreview-files=${JSON.stringify(files)}\n`);
    if (reviewPaths.length) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
            '### Files for maintainer review', '',
            ...files.map(path => `- \`${path}\``),
            ...(reviewPaths.length > files.length ? ['- Additional files are listed in the patch.'] : []), '',
        ].join('\n'));
    }
}
