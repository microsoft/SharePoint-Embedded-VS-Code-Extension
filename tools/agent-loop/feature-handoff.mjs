import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { approval, issueClient, sensitivePath } from './feature-issue.mjs';
import { appendIssueDelivery, splitIssueDelivery } from './issue-delivery-section.mjs';
import { requiresManualPublishing, reviewedDiff } from './publish-feature.mjs';

export function classifyFeatureHandoff(raw) {
    const files = reviewedDiff(raw);
    const reviewPaths = files.filter(file => file.executable || sensitivePath(file.path)).map(({ path }) => path);
    return { autoPublish: !files.some(requiresManualPublishing), reviewPaths };
}

export async function updateFeatureHandoff(event, env, fetcher = fetch) {
    const github = issueClient(event, env, fetcher);
    if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || event.action !== 'labeled' || event.label?.name !== 'agent-ready') {
        throw new Error('Expected the approved feature run event.');
    }
    const files = JSON.parse(env.REVIEW_FILES || '[]');
    if (!Array.isArray(files) || files.length > 40 || files.some(file => typeof file !== 'string' || !/^[\w./?-]+$/.test(file))) {
        throw new Error('Invalid sensitive file list.');
    }
    if (![env.PATCH_ARTIFACT_ID, env.VSIX_ARTIFACT_ID].every(id => /^[1-9]\d*$/.test(id ?? ''))) {
        throw new Error('Expected the reviewed patch and VSIX artifact IDs.');
    }
    const repoUrl = `https://github.com/${env.GITHUB_REPOSITORY}`;
    const runUrl = `${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}`;
    const branch = `feature-agent/issue-${event.issue.number}`;
    const delivery = /^[1-9]\d*$/.test(env.DRAFT_PR_NUMBER ?? '') ? `Draft PR: [#${env.DRAFT_PR_NUMBER}](${repoUrl}/pull/${env.DRAFT_PR_NUMBER}).`
        : env.BRANCH_PUSHED === 'true' ? `Branch pushed: [\`${branch}\`](${repoUrl}/tree/${branch}). No draft PR was opened by this run.`
        : env.AUTO_PUBLISH === 'true' ? 'The publisher did not confirm a branch push. See the run for details.'
        : 'No branch was pushed automatically because the patch changes CI or build controls, or contains an unsupported file path or mode.';
    const markdown = [
        '## Feature agent delivery', '',
        '**Build complete for the approved issue revision.**',
        `- [Download the testable VSIX and checksum](${runUrl}/artifacts/${env.VSIX_ARTIFACT_ID})`,
        `- [Download the reviewed patch](${runUrl}/artifacts/${env.PATCH_ARTIFACT_ID})`,
        `- [View the Actions run](${runUrl})`,
        '', delivery,
        '', 'Downloads require GitHub sign-in and expire after 7 days. Review the patch first, then unzip the VSIX download and use **Extensions: Install from VSIX...** in an isolated VS Code environment.',
        ...(files.length ? ['', '**Sensitive or infrastructure files to review before merging or installing:**',
            ...files.map(file => `- \`${file}\``), ...(files.length === 40 ? ['- See the patch for the full file list.'] : [])] : []),
    ].join('\n');
    const approvers = new Set((env.FEATURE_REQUEST_APPROVERS ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
    const issue = await github();
    const decision = approval(event, issue, approvers);
    if (!decision.approved) {
        console.log(`Skipped updating the issue description: ${decision.reason}`);
        return;
    }
    const { requirements, runId } = splitIssueDelivery(issue.body);
    if (runId && BigInt(runId) > BigInt(env.GITHUB_RUN_ID)) {
        console.log('Skipped updating the issue description: a newer run is already listed.');
        return;
    }
    const body = appendIssueDelivery(requirements, env.GITHUB_RUN_ID, markdown);
    if (issue.body !== body) {
        await github('', { method: 'PATCH', body: { body } });
        console.log('Updated the Feature agent delivery section.');
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'report') {
    await updateFeatureHandoff(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), process.env);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { autoPublish, reviewPaths } = classifyFeatureHandoff(readFileSync(0, 'utf8'));
    const files = reviewPaths.slice(0, 40).map(path => path.replace(/[^\w./-]/g, '?').slice(0, 240));
    appendFileSync(process.env.GITHUB_OUTPUT, `auto-publish=${autoPublish}\nreview-files=${JSON.stringify(files)}\n`);
    if (reviewPaths.length) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
            '### Files for maintainer review', '',
            ...files.map(path => `- \`${path}\``),
            ...(reviewPaths.length > files.length ? ['- Additional files are listed in the patch.'] : []), '',
        ].join('\n'));
    }
}
