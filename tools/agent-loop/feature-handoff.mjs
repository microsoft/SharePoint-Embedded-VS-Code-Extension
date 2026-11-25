import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { approval, hasLabel, intake, issueClient, matchesIssueEvent, READY, sensitivePath } from './feature-issue.mjs';
import { appendIssueDelivery, splitIssueDelivery } from './issue-delivery-section.mjs';
import { reviewedDiff } from './publish-feature.mjs';

const HUMAN_REVIEW = 'ready-for-human-review';

export function classifyFeatureHandoff(raw) {
    const files = reviewedDiff(raw);
    return { reviewPaths: files.filter(file => file.executable || sensitivePath(file.path)).map(({ path }) => path) };
}

function deliveryContext(event, env, fetcher) {
    const github = issueClient(event, env, fetcher);
    if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || event.action !== 'labeled' || event.label?.name !== 'agent-ready') {
        throw new Error('Expected the approved feature run event.');
    }
    const repoUrl = `https://github.com/${env.GITHUB_REPOSITORY}`;
    return { github, repoUrl, runUrl: `${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}` };
}

async function writeDelivery(event, env, github, markdown, { existingRunOnly = false, changedMarkdown, humanReview } = {}) {
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
        if (humanReview && sameRun && matchesIssueEvent(event, issue) && issue.state === 'open' &&
            hasLabel(issue, HUMAN_REVIEW) && !hasLabel(issue, READY) &&
            issue.body === appendIssueDelivery(requirements, env.GITHUB_RUN_ID, markdown)) return true;
        if (!sameRun || !changedMarkdown) {
            console.log(`Skipped updating the issue description: ${decision.reason}`);
            return false;
        }
        markdown = changedMarkdown;
    }
    const body = appendIssueDelivery(requirements, env.GITHUB_RUN_ID, markdown);
    if (decision.approved && humanReview) {
        // Change both status labels in one request so the handoff cannot leave both set.
        const labels = issue.labels.map(({ name }) => name).filter(name => ![READY, HUMAN_REVIEW].includes(name.toLowerCase()));
        const updated = await github('', { method: 'PATCH', body: { body, labels: [...labels, HUMAN_REVIEW] } });
        if (updated.body !== body || !hasLabel(updated, HUMAN_REVIEW) || hasLabel(updated, READY)) {
            throw new Error(`GitHub did not confirm the issue handoff and "${HUMAN_REVIEW}" label.`);
        }
        console.log('Updated the Feature agent delivery section and marked it ready for human review.');
    } else if (issue.body !== body) {
        await github('', { method: 'PATCH', body: { body } });
        console.log('Updated the Feature agent delivery section.');
    }
    if (decision.approved && humanReview === false && hasLabel(issue, HUMAN_REVIEW)) {
        const latest = await github();
        if (splitIssueDelivery(latest.body).runId !== env.GITHUB_RUN_ID || !approval(event, latest, approvers).approved) {
            console.log('Skipped clearing the human review label: the issue or current run changed.');
        } else if (hasLabel(latest, HUMAN_REVIEW)) {
            await github(`/labels/${HUMAN_REVIEW}`, { method: 'DELETE', missingOk: true });
        }
    }
    return decision.approved;
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
    if (!await writeDelivery(event, env, github, status, { humanReview: false })) return;
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

async function branchBlocker(event, env, branch, fetcher) {
    if (env.BRANCH_PUSHED !== 'true') return 'No feature branch was confirmed. Inspect the publish job before retrying.';
    if (!/^[a-f0-9]{40}$/.test(env.BRANCH_COMMIT ?? '')) return 'The publisher did not identify the reviewed branch commit.';
    const api = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
    const get = path => fetcher(api + path, {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
        redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    try {
        const ref = await get(`/git/ref/heads/${branch}`);
        if (!ref.ok) return `GitHub could not confirm the feature branch (HTTP ${ref.status}).`;
        if ((await ref.json()).object?.sha !== env.BRANCH_COMMIT) return 'The feature branch no longer points to the reviewed commit. Check for a newer run.';
        const comparison = await get(`/compare/${encodeURIComponent(event.repository.default_branch)}...${env.BRANCH_COMMIT}?per_page=1`);
        if (!comparison.ok) return `GitHub could not compare the reviewed commit with the default branch (HTTP ${comparison.status}).`;
        const diff = await comparison.json();
        if (!(diff.ahead_by > 0 && Array.isArray(diff.files) && diff.files.length)) {
            return 'There is no PR diff against the default branch. Check whether the feature has already landed.';
        }
    } catch (error) {
        if (!(error instanceof TypeError || error instanceof SyntaxError || ['AbortError', 'TimeoutError'].includes(error.name))) throw error;
        return 'GitHub did not return usable branch or comparison data. Retry handoff after connectivity is restored.';
    }
    return '';
}

export async function updateFeatureHandoff(event, env, fetcher = fetch) {
    const { github, repoUrl, runUrl } = deliveryContext(event, env, fetcher);
    const changedMarkdown = runStatus(runUrl, '**Run no longer applies to this issue.**',
        'The issue or its approval changed. Wait for readiness review of the current request, then reapply `agent-ready` if you want to run it again.');
    const retriedWorkers = /^[1-9]\d{0,2}$/.test(env.WORKER_RETRIES ?? '') ? Number(env.WORKER_RETRIES) : 0;
    const retryNote = retriedWorkers === 1 ? 'The agent retried a worker once automatically.'
        : `The agent retried workers ${retriedWorkers} times automatically.`;
    const offlineNote = /^[1-9]\d{0,2}$/.test(env.OFFLINE_PLANS ?? '')
        ? `Offline alternatives attempted without additional permissions: ${env.OFFLINE_PLANS}.` : '';
    if (env.IMPLEMENT_RESULT && env.IMPLEMENT_RESULT !== 'success') {
        const cancelled = env.IMPLEMENT_RESULT === 'cancelled';
        const diagnostic = env.AGENT_DIAGNOSTIC?.length <= 4096 &&
            /^[A-Za-z0-9 ().,:;'-]+$/.test(env.AGENT_DIAGNOSTIC) ? env.AGENT_DIAGNOSTIC : '';
        let detail = '';
        if (!cancelled) {
            const job = await getImplementationJob(env, fetcher).catch(error => {
                console.warn(`Could not load the failed milestone: ${error.message}`);
            });
            const failedAgent = job?.steps?.some(step => step.name === 'Run the agent loop and export the reviewed diff' && step.conclusion === 'failure');
            const stage = (failedAgent ? agentStages.get(env.AGENT_STAGE) : undefined) ?? implementationMilestone(job, 'failure');
            detail = `Stopped at: **${stage}**. No testable VSIX was delivered.`;
            if (diagnostic) {
                detail += `\n\n**Reason:** ${diagnostic}\n\n**Automatic worker retries:** ${retriedWorkers}.`;
            } else if (retriedWorkers) detail = `${retryNote} ${detail}`;
            if (offlineNote) detail += `\n\n${offlineNote}`;
            if (/^[1-9]\d*$/.test(env.PATCH_ARTIFACT_ID ?? '')) {
                detail += ` [Download the reviewed patch](${runUrl}/artifacts/${env.PATCH_ARTIFACT_ID}).`;
            }
        }
        await writeDelivery(event, env, github,
            runStatus(runUrl, cancelled ? '**Run cancelled.**'
                : diagnostic.includes('requested approval:') ? '**Needs a maintainer decision.**'
                : retriedWorkers ? '**Run blocked after automatic recovery.**' : '**Implementation failed.**', detail),
            { existingRunOnly: env.IMPLEMENT_APPROVED !== 'true', changedMarkdown, humanReview: false });
        return;
    }
    if (env.IMPLEMENT_APPROVED !== 'true') {
        console.log('No approved implementation to hand off.');
        return;
    }
    if (env.IMPLEMENT_RESULT !== 'success') throw new Error('Implementation success was not confirmed.');
    const files = JSON.parse(env.REVIEW_FILES || '[]');
    if (!Array.isArray(files) || files.length > 40 || files.some(file => typeof file !== 'string' || !/^[\w./?-]+$/.test(file))) {
        throw new Error('Invalid sensitive file list.');
    }
    if (![env.PATCH_ARTIFACT_ID, env.VSIX_ARTIFACT_ID].every(id => /^[1-9]\d*$/.test(id ?? ''))) {
        const missing = 'The reviewed patch or testable VSIX was not delivered. Check whether approval changed or artifact upload failed.';
        await writeDelivery(event, env, github, runStatus(runUrl, '**Not PR-ready.**', missing), { changedMarkdown, humanReview: false });
        throw new Error(missing);
    }
    const branch = `feature-agent/issue-${event.issue.number}`;
    const compareUrl = `${repoUrl}/compare/${encodeURIComponent(event.repository.default_branch)}...${branch}`;
    const blocker = await branchBlocker(event, env, branch, fetcher);
    const hasBranch = !blocker;
    const hasPR = /^[1-9]\d*$/.test(env.DRAFT_PR_NUMBER ?? '');
    const delivery = hasBranch ? [
        `Branch pushed: [\`${branch}\`](${repoUrl}/tree/${branch}). [View code changes](${compareUrl}).`,
        ...(env.PR_POLICY_BLOCKED === 'true' ? ['GitHub policy blocked automatic draft PR creation.'] : []),
        hasPR ? `Draft PR: [#${env.DRAFT_PR_NUMBER}](${repoUrl}/pull/${env.DRAFT_PR_NUMBER}).`
            : `[Open a PR manually](${compareUrl}?expand=1).`,
    ].join('\n\n') : blocker;
    const humanReview = hasBranch;
    const markdown = [
        '## Feature agent delivery', '',
        humanReview ? '**Ready for human review.**' : '**Not PR-ready.**',
        ...(retriedWorkers ? ['', retryNote, ''] : []),
        ...(offlineNote ? [offlineNote, ''] : []),
        `- [Download the testable VSIX and checksum](${runUrl}/artifacts/${env.VSIX_ARTIFACT_ID})`,
        `- [Download the reviewed patch](${runUrl}/artifacts/${env.PATCH_ARTIFACT_ID})`,
        `- [View the Actions run](${runUrl})`,
        '', delivery,
        ...(/^[a-f0-9]{40}$/.test(env.UX_SCREENSHOT_COMMIT ?? '')
            ? ['', `![Playwright UX screenshot](https://raw.githubusercontent.com/${env.GITHUB_REPOSITORY}/${env.UX_SCREENSHOT_COMMIT}/ux-preview.png)`] : []),
        '', 'Downloads require GitHub sign-in and expire after 7 days. Review the patch first, then unzip the VSIX download and use **Extensions: Install from VSIX...** in an isolated VS Code environment.',
        ...(files.length ? ['', '**Sensitive or infrastructure files to review before merging or installing:**',
            ...files.map(file => `- \`${file}\``), ...(files.length === 40 ? ['- See the patch for the full file list.'] : [])] : []),
    ].join('\n');
    const delivered = await writeDelivery(event, env, github, markdown, { changedMarkdown, humanReview });
    if (!delivered) throw new Error('This run cannot claim delivery: its approval changed or a newer run owns the issue.');
    if (blocker) throw new Error(blocker);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (['watch', 'report'].includes(process.argv[2])) {
        const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        const update = process.argv[2] === 'watch' ? watchFeatureRun : updateFeatureHandoff;
        await update(event, process.env);
    } else {
        const { reviewPaths } = classifyFeatureHandoff(readFileSync(0, 'utf8'));
        const files = reviewPaths.slice(0, 40).map(path => path.replace(/[^\w./-]/g, '?').slice(0, 240));
        appendFileSync(process.env.GITHUB_OUTPUT, `review-files=${JSON.stringify(files)}\n`);
        if (reviewPaths.length) {
            appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
                '### Files for maintainer review', '',
                ...files.map(path => `- \`${path}\``),
                ...(reviewPaths.length > files.length ? ['- Additional files are listed in the patch.'] : []), '',
            ].join('\n'));
        }
    }
}
