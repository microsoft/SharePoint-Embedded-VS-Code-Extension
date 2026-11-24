import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { approval, intake, issueClient, sensitivePath } from './feature-issue.mjs';
import { appendIssueDelivery, splitIssueDelivery } from './issue-delivery-section.mjs';
import { requiresManualPublishing, reviewedDiff } from './publish-feature.mjs';

export function classifyFeatureHandoff(raw) {
    const files = reviewedDiff(raw);
    const reviewPaths = files.filter(file => file.executable || sensitivePath(file.path)).map(({ path }) => path);
    return { autoPublish: !files.some(requiresManualPublishing), reviewPaths };
}

function deliveryContext(event, env, fetcher) {
    const github = issueClient(event, env, fetcher);
    if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || event.action !== 'labeled' || event.label?.name !== 'agent-ready') {
        throw new Error('Expected the approved feature run event.');
    }
    const repoUrl = `https://github.com/${env.GITHUB_REPOSITORY}`;
    return { github, repoUrl, runUrl: `${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}` };
}

async function writeDelivery(event, env, github, markdown, { existingRunOnly = false, changedMarkdown } = {}) {
    const approvers = new Set((env.FEATURE_REQUEST_APPROVERS ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
    const issue = await github();
    const decision = approval(event, issue, approvers);
    const { requirements, runId } = splitIssueDelivery(issue.body);
    const sameRun = runId === env.GITHUB_RUN_ID && issue.id === event.issue.id;
    if (existingRunOnly && !sameRun) return false;
    if (runId && BigInt(runId) > BigInt(env.GITHUB_RUN_ID)) {
        console.log('Skipped updating the issue description: a newer run is already listed.');
        return false;
    }
    if (!decision.approved) {
        if (!sameRun || !changedMarkdown) {
            console.log(`Skipped updating the issue description: ${decision.reason}`);
            return false;
        }
        markdown = changedMarkdown;
    }
    const body = appendIssueDelivery(requirements, env.GITHUB_RUN_ID, markdown);
    if (issue.body !== body) {
        await github('', { method: 'PATCH', body: { body } });
        console.log('Updated the Feature agent delivery section.');
    }
    return true;
}

const milestones = new Map([
    ['Authorize issue and compile its task contract', 'Checking approval and preparing the task'],
    ['Prepare the locked project dependencies, Copilot CLI and validation image', 'Preparing the isolated runner'],
    ['Recheck approval before implementation', 'Checking that approval is still current'],
    ['Run the agent loop and export the reviewed diff', 'Implementing, testing, and reviewing the change'],
    ['Confirm the issue has not changed before handoff', 'Checking the issue before delivering results'],
    ['Upload the reviewed patch for maintainers', 'Uploading the reviewed patch'],
    ['Package a testable VSIX from the reviewed commit', 'Building the testable VSIX'],
    ['Upload testable VSIX', 'Uploading the testable VSIX'],
]);

const agentStages = new Map([
    ['contract', 'Loading the implementation contract'],
    ['copilot-preflight', 'Checking the Copilot runtime and authentication'],
    ['implementation', 'Implementation or test worker'],
    ['integration', 'Integrating worker changes'],
    ['validation', 'Validating the candidate'],
    ['review', 'Independent review'],
    ['repass', 'Reworking the candidate after review'],
]);

export function implementationMilestone(job, status) {
    const steps = job?.steps ?? [];
    if (status === 'failure') {
        const failed = steps.find(step => ['failure', 'timed_out'].includes(step.conclusion));
        return milestones.get(failed?.name) ?? 'Implementation job';
    }
    const active = steps.find(step => step.status === 'in_progress');
    return milestones.get(active?.name) ?? (job?.status === 'in_progress' ? 'Starting the implementation job' : 'Waiting for an implementation runner');
}

async function getImplementationJob(env, fetcher) {
    const response = await fetcher(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/1/jobs?per_page=100`, {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
        redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub Actions jobs API returned HTTP ${response.status}.`);
    const { jobs } = await response.json();
    return jobs.find(job => job.name === 'implement');
}

function runStatus(runUrl, status, detail = '') {
    return ['## Feature agent delivery', '', status, ...(detail ? ['', detail] : []),
        '', `[View the current Actions run](${runUrl}).`].join('\n');
}

export async function watchFeatureRun(event, env, fetcher = fetch, wait = sleep) {
    const { github, runUrl } = deliveryContext(event, env, fetcher);
    const decision = await intake({ event, mode: 'confirm', env, fetcher });
    if (!decision.approved) {
        console.log(`Skipped feature progress: ${decision.message}`);
        return;
    }
    let status = runStatus(runUrl, '**Picked up.** Waiting for an implementation runner.');
    if (!await writeDelivery(event, env, github, status)) return;
    // Let the final report run even if the implementation never gets a runner.
    const until = Date.now() + 125 * 60_000;
    while (Date.now() < until) {
        const job = await getImplementationJob(env, fetcher);
        if (job?.status === 'completed') return;
        const next = job?.status === 'in_progress'
            ? runStatus(runUrl, `**In progress:** ${implementationMilestone(job)}.`)
            : runStatus(runUrl, '**Picked up.** Waiting for an implementation runner.');
        if (next !== status) {
            if (!await writeDelivery(event, env, github, next)) return;
            status = next;
        }
        await wait(30_000);
    }
    console.warn('Feature progress polling timed out; the final report will still run.');
}

export async function updateFeatureHandoff(event, env, fetcher = fetch) {
    const { github, repoUrl, runUrl } = deliveryContext(event, env, fetcher);
    const changedMarkdown = runStatus(runUrl, '**Run no longer applies to this issue.**',
        'The issue or its approval changed. Wait for readiness review of the current request, then reapply `agent-ready` if you want to run it again.');
    if (env.IMPLEMENT_RESULT && env.IMPLEMENT_RESULT !== 'success') {
        const cancelled = env.IMPLEMENT_RESULT === 'cancelled';
        let detail = '';
        if (!cancelled) {
            const job = await getImplementationJob(env, fetcher).catch(error => {
                console.warn(`Could not load the failed milestone: ${error.message}`);
            });
            const failedAgent = job?.steps?.some(step => step.name === 'Run the agent loop and export the reviewed diff' && step.conclusion === 'failure');
            const stage = (failedAgent ? agentStages.get(env.AGENT_STAGE) : undefined) ?? implementationMilestone(job, 'failure');
            detail = `Stopped at: **${stage}**. No testable VSIX was delivered.`;
            if (/^[1-9]\d*$/.test(env.PATCH_ARTIFACT_ID ?? '')) {
                detail += ` [Download the reviewed patch](${runUrl}/artifacts/${env.PATCH_ARTIFACT_ID}).`;
            }
        }
        await writeDelivery(event, env, github,
            runStatus(runUrl, cancelled ? '**Run cancelled.**' : '**Implementation failed.**', detail),
            { existingRunOnly: env.IMPLEMENT_APPROVED !== 'true', changedMarkdown });
        return;
    }
    if (!env.VSIX_ARTIFACT_ID && env.IMPLEMENT_RESULT === 'success') {
        await writeDelivery(event, env, github, runStatus(runUrl, '**Stopped without a VSIX.**',
            'The run did not produce a patch, or the issue changed and the prior approval could no longer be used.'),
        { existingRunOnly: true, changedMarkdown });
        return;
    }
    const files = JSON.parse(env.REVIEW_FILES || '[]');
    if (!Array.isArray(files) || files.length > 40 || files.some(file => typeof file !== 'string' || !/^[\w./?-]+$/.test(file))) {
        throw new Error('Invalid sensitive file list.');
    }
    if (![env.PATCH_ARTIFACT_ID, env.VSIX_ARTIFACT_ID].every(id => /^[1-9]\d*$/.test(id ?? ''))) {
        throw new Error('Expected the reviewed patch and VSIX artifact IDs.');
    }
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
    await writeDelivery(event, env, github, markdown, { changedMarkdown });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (['watch', 'report'].includes(process.argv[2])) {
        const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        const update = process.argv[2] === 'watch' ? watchFeatureRun : updateFeatureHandoff;
        await update(event, process.env);
    } else {
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
}
