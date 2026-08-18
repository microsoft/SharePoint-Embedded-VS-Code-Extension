import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    agentProfileRepositoryPath
} from './agentProfiles';
import {
    createReviewResultValidator,
    createWorkerResultValidator,
    loadContract,
    requireSingleRole
} from './contract';
import {
    formatRepassContext,
    invokeEditingWorker,
    invokeReviewer
} from './copilot';
import {
    initializeEvidence,
    transitionRun,
    writeJson,
    writeRunRecord
} from './evidence';
import {
    changedPaths,
    cherryPick,
    committedChangedPaths,
    createWorkerCommit,
    createWorktree,
    currentCommit,
    diffCheck,
    findRepositoryRoot,
    pathExistsAtCommit,
    resolveCommit
} from './git';
import { assertChangedPathsAllowed, matchesAny } from './paths';
import { outputTail, runShellCommand } from './process';
import {
    AuthorityPolicy,
    LoadedContract,
    ReviewFinding,
    ReviewResult,
    RunRecord,
    TaskContract,
    ValidationResult,
    WorkerAssignment,
    WorkerRunRecord,
    WorkerResult
} from './types';

export interface RunOptions {
    contractPath: string;
}

interface RunContext {
    repoRoot: string;
    loaded: LoadedContract;
    run: RunRecord;
    workerValidator: (value: unknown) => string[];
    reviewValidator: (value: unknown) => string[];
}

export async function validateContractCommand(contractPath: string): Promise<LoadedContract> {
    const repoRoot = await findRepositoryRoot(process.cwd());
    return loadContract(repoRoot, contractPath);
}

export async function createExecutionPlan(contractPath: string): Promise<object> {
    const repoRoot = await findRepositoryRoot(process.cwd());
    const loaded = loadContract(repoRoot, contractPath);
    const baseCommit = await resolveCommit(repoRoot, loaded.contract.baseBranch);

    return {
        taskId: loaded.contract.taskId,
        title: loaded.contract.title,
        baseBranch: loaded.contract.baseBranch,
        baseCommit,
        maxConcurrentWorkers: loaded.contract.limits.maxConcurrentWorkers,
        maxRepasses: loaded.contract.limits.maxRepasses,
        workers: await Promise.all(loaded.contract.workers.map(async worker => ({
            id: worker.id,
            role: worker.role,
            agent: worker.agent,
            customAgentInBase: await pathExistsAtCommit(
                repoRoot,
                baseCommit,
                agentProfileRepositoryPath(worker.agent)
            ),
            isolation: worker.isolation,
            mayEdit: worker.mayEdit,
            dependsOn: worker.dependsOn,
            allowedPaths: worker.allowedPaths
        }))),
        requiredChecks: loaded.contract.requiredChecks,
        authorityPolicy: loaded.contract.authority.policyFile,
        terminalState: 'awaiting-human-acceptance'
    };
}

export async function runContract(options: RunOptions): Promise<RunRecord> {
    const repoRoot = await findRepositoryRoot(process.cwd());
    const loaded = loadContract(repoRoot, options.contractPath);
    const baseCommit = await resolveCommit(repoRoot, loaded.contract.baseBranch);
    await assertAgentProfilesInBase(repoRoot, baseCommit, loaded.contract.workers);
    const runId = createRunId();
    const artifactsDir = path.join(repoRoot, '.agent-runs', loaded.contract.taskId, runId);
    const configuredWorktreeRoot = process.env.AGENT_LOOP_WORKTREE_ROOT;
    const worktreeRoot = path.join(
        configuredWorktreeRoot
            ? path.resolve(configuredWorktreeRoot)
            : path.join(os.tmpdir(), 'spe-agent-loop'),
        runId
    );
    const integrationBranch = branchName(loaded.contract.taskId, 'integration', runId);
    const now = new Date().toISOString();
    const run: RunRecord = {
        schemaVersion: '1.0',
        runId,
        taskId: loaded.contract.taskId,
        contractPath: loaded.contractPath,
        repoRoot,
        baseCommit,
        integrationBranch,
        phase: 'created',
        repass: 0,
        startedAt: now,
        updatedAt: now,
        artifactsDir,
        worktreeRoot,
        workers: [],
        reviewArtifacts: [],
        errors: []
    };
    const context: RunContext = {
        repoRoot,
        loaded,
        run,
        workerValidator: createWorkerResultValidator(repoRoot),
        reviewValidator: createReviewResultValidator(repoRoot)
    };

    await mkdir(worktreeRoot, { recursive: true });
    await initializeEvidence(repoRoot, loaded, run);

    try {
        await transitionRun(repoRoot, run, 'implementing');
        const implementer = requireSingleRole(loaded.contract, 'implementer');
        const sdet = requireSingleRole(loaded.contract, 'sdet');
        const initialWorkers = await runInitialWorkers(context, implementer, sdet);
        requireCompletedWorkers(initialWorkers);

        assertWithinWallClock(run, loaded.contract);
        await transitionRun(repoRoot, run, 'integrating');
        const integrationWorktree = path.join(worktreeRoot, 'integration');
        run.integrationWorktree = integrationWorktree;
        await createWorktree(repoRoot, integrationWorktree, baseCommit, integrationBranch);
        await provisionDependencies(integrationWorktree);
        for (const worker of initialWorkers) {
            if (worker.outputCommit && worker.outputCommit !== baseCommit) {
                await cherryPick(integrationWorktree, worker.outputCommit);
            }
        }
        run.integratedCommit = await currentCommit(integrationWorktree);
        await writeIntegrationResult(context, initialWorkers[0].startedAt);
        await writeRunRecord(repoRoot, run);

        let validation = await runValidation(context);
        let review = await runReview(context, validation);

        while (
            (review.decision === 'changes-required' || validation.some(result => result.status === 'failed')) &&
            run.repass < loaded.contract.limits.maxRepasses
        ) {
            assertWithinWallClock(run, loaded.contract);
            run.repass += 1;
            await transitionRun(repoRoot, run, 'repassing');

            const repassWorkers = await runRepassWorkers(context, review.findings, validation);
            requireCompletedWorkers(repassWorkers);
            for (const worker of repassWorkers) {
                if (worker.outputCommit && worker.outputCommit !== run.integratedCommit) {
                    await cherryPick(integrationWorktree, worker.outputCommit);
                }
            }

            run.integratedCommit = await currentCommit(integrationWorktree);
            await writeIntegrationResult(context, new Date().toISOString());
            await writeRunRecord(repoRoot, run);
            validation = await runValidation(context);
            review = await runReview(context, validation);
        }

        if (validation.some(result => result.status === 'failed')) {
            await transitionRun(repoRoot, run, 'blocked', 'Required validation still fails after repass budget');
            return run;
        }
        if (review.decision !== 'pass') {
            await transitionRun(
                repoRoot,
                run,
                'blocked',
                review.decision === 'blocked'
                    ? review.summary
                    : 'Independent review still requires changes after repass budget'
            );
            return run;
        }

        await transitionRun(repoRoot, run, 'awaiting-human-acceptance');
        return run;
    } catch (error) {
        const message = errorMessage(error);
        await transitionRun(repoRoot, run, 'failed', message);
        throw error;
    }
}

async function runInitialWorkers(
    context: RunContext,
    implementer: WorkerAssignment,
    sdet: WorkerAssignment
): Promise<WorkerResult[]> {
    if (context.loaded.contract.limits.maxConcurrentWorkers > 1) {
        return Promise.all([
            runEditingAssignment(context, implementer, context.run.baseCommit, 0),
            runEditingAssignment(context, sdet, context.run.baseCommit, 0)
        ]);
    }

    return [
        await runEditingAssignment(context, implementer, context.run.baseCommit, 0),
        await runEditingAssignment(context, sdet, context.run.baseCommit, 0)
    ];
}

async function runRepassWorkers(
    context: RunContext,
    findings: ReviewFinding[],
    validation: ValidationResult[]
): Promise<WorkerResult[]> {
    const implementer = requireSingleRole(context.loaded.contract, 'implementer');
    const sdet = requireSingleRole(context.loaded.contract, 'sdet');
    const failedValidationContext = formatValidationSummary(validation);
    const implementerFindings: ReviewFinding[] = [];
    const sdetFindings: ReviewFinding[] = [];

    for (const finding of findings) {
        if (finding.id.startsWith('F-9')) {
            implementerFindings.push(finding);
            sdetFindings.push(finding);
        } else if (
            finding.category === 'testing' ||
            (finding.file !== undefined && matchesAny(sdet.allowedPaths, finding.file))
        ) {
            sdetFindings.push(finding);
        } else {
            implementerFindings.push(finding);
        }
    }

    const work: Array<Promise<WorkerResult>> = [];
    if (implementerFindings.length > 0) {
        work.push(runEditingAssignment(
            context,
            implementer,
            context.run.integratedCommit!,
            context.run.repass,
            formatRepassContext(implementerFindings, failedValidationContext)
        ));
    }
    if (sdetFindings.length > 0) {
        work.push(runEditingAssignment(
            context,
            sdet,
            context.run.integratedCommit!,
            context.run.repass,
            formatRepassContext(sdetFindings, failedValidationContext)
        ));
    }

    if (work.length === 0) {
        throw new Error('Repass was requested without an actionable finding');
    }

    if (context.loaded.contract.limits.maxConcurrentWorkers > 1) {
        return Promise.all(work);
    }

    const results: WorkerResult[] = [];
    for (const worker of work) {
        results.push(await worker);
    }
    return results;
}

async function runEditingAssignment(
    context: RunContext,
    assignment: WorkerAssignment,
    baseCommit: string,
    attempt: number,
    additionalContext?: string
): Promise<WorkerResult> {
    const suffix = attempt === 0 ? 'initial' : `repass-${attempt}`;
    const invocationId = `${assignment.id}-${suffix}`;
    const worktreePath = path.join(context.run.worktreeRoot, invocationId);
    const workerArtifactDir = path.join(context.run.artifactsDir, 'workers', invocationId);
    const branch = branchName(context.loaded.contract.taskId, invocationId, context.run.runId);
    const startedAt = new Date().toISOString();
    const record: WorkerRunRecord = {
        assignmentId: assignment.id,
        role: assignment.role,
        attempt,
        worktreePath,
        branchName: branch,
        status: 'running'
    };
    context.run.workers.push(record);
    await writeRunRecord(context.repoRoot, context.run);

    await createWorktree(context.repoRoot, worktreePath, baseCommit, branch);
    await provisionDependencies(worktreePath);

    try {
        const reported = await invokeEditingWorker({
            repoRoot: context.repoRoot,
            worktreePath,
            artifactDir: workerArtifactDir,
            runId: context.run.runId,
            baseCommit,
            contract: context.loaded.contract,
            policy: context.loaded.policy,
            assignment,
            resultSchemaPath: path.join(
                context.repoRoot,
                '.agent',
                'schemas',
                'worker-result.schema.json'
            ),
            validate: context.workerValidator,
            additionalContext
        });
        const filesChanged = await changedPaths(worktreePath);
        assertChangedPathsAllowed(
            filesChanged,
            context.loaded.contract.allowedPaths,
            assignment.allowedPaths,
            [
                ...context.loaded.contract.deniedPaths,
                ...context.loaded.policy.filesystem.deny
            ]
        );
        await diffCheck(worktreePath);

        const outputCommit = reported.status === 'completed'
            ? await createWorkerCommit(
                worktreePath,
                context.loaded.contract.taskId,
                assignment.id,
                attempt
            )
            : null;
        const result: WorkerResult = {
            ...reported,
            runId: context.run.runId,
            taskId: context.loaded.contract.taskId,
            workerId: invocationId,
            role: assignment.role === 'sdet' ? 'sdet' : 'implementer',
            startedAt,
            finishedAt: new Date().toISOString(),
            baseCommit,
            outputCommit,
            filesChanged,
            artifacts: [
                ...reported.artifacts,
                {
                    type: 'copilot-events',
                    path: path.join(workerArtifactDir, 'events.ndjson'),
                    description: 'Structured Copilot CLI session events'
                }
            ]
        };
        assertStructuredResult(context.workerValidator, result, `Worker ${invocationId}`);
        const resultPath = path.join(workerArtifactDir, 'result.json');
        await writeJson(resultPath, result);

        record.status = result.status;
        record.resultArtifact = resultPath;
        record.outputCommit = result.outputCommit;
        await writeRunRecord(context.repoRoot, context.run);
        return result;
    } catch (error) {
        let failure = errorMessage(error);
        try {
            const filesChanged = await changedPaths(worktreePath);
            assertChangedPathsAllowed(
                filesChanged,
                context.loaded.contract.allowedPaths,
                assignment.allowedPaths,
                [
                    ...context.loaded.contract.deniedPaths,
                    ...context.loaded.policy.filesystem.deny
                ]
            );
        } catch (authorityError) {
            failure = `${failure}; ${errorMessage(authorityError)}`;
        }
        record.status = 'failed';
        const failurePath = path.join(workerArtifactDir, 'failure.json');
        record.resultArtifact = failurePath;
        await writeJson(failurePath, {
            workerId: invocationId,
            status: 'failed',
            error: failure,
            finishedAt: new Date().toISOString()
        });
        await writeRunRecord(context.repoRoot, context.run);
        throw new Error(failure);
    }
}

async function writeIntegrationResult(context: RunContext, startedAt: string): Promise<void> {
    const worktree = context.run.integrationWorktree!;
    const filesChanged = await committedChangedPaths(
        worktree,
        context.run.baseCommit,
        context.run.integratedCommit
    );
    assertChangedPathsAllowed(
        filesChanged,
        context.loaded.contract.allowedPaths,
        context.loaded.contract.allowedPaths,
        [
            ...context.loaded.contract.deniedPaths,
            ...context.loaded.policy.filesystem.deny
        ]
    );

    const result: WorkerResult = {
        schemaVersion: '1.0',
        runId: context.run.runId,
        taskId: context.loaded.contract.taskId,
        workerId: `integration-${context.run.repass}`,
        role: 'integrator',
        status: 'completed',
        startedAt,
        finishedAt: new Date().toISOString(),
        baseCommit: context.run.baseCommit,
        outputCommit: context.run.integratedCommit!,
        summary: 'Worker commits were integrated deterministically without unresolved conflicts.',
        criteria: context.loaded.contract.acceptanceCriteria.map(criterion => ({
            id: criterion.id,
            status: 'not-applicable',
            evidence: 'The integrator records provenance and gates; the reviewer classifies acceptance.'
        })),
        filesChanged,
        validations: [],
        artifacts: [],
        risks: [],
        approvalRequests: []
    };
    assertStructuredResult(context.workerValidator, result, 'Integration result');
    await writeJson(
        path.join(context.run.artifactsDir, 'integration', `result-${context.run.repass}.json`),
        result
    );
}

async function runValidation(context: RunContext): Promise<ValidationResult[]> {
    await transitionRun(context.repoRoot, context.run, 'validating');
    const results: ValidationResult[] = [];

    for (const check of context.loaded.contract.requiredChecks) {
        assertWithinWallClock(context.run, context.loaded.contract);
        const checkDir = path.join(
            context.run.artifactsDir,
            'validation',
            `attempt-${context.run.repass}`
        );
        const stdoutPath = path.join(checkDir, `${check.id}.stdout.log`);
        const stderrPath = path.join(checkDir, `${check.id}.stderr.log`);
        const processResult = await runShellCommand(check.command, {
            cwd: context.run.integrationWorktree!,
            timeoutMs: check.timeoutMinutes * 60_000,
            stdoutPath,
            stderrPath
        });
        results.push({
            command: check.command,
            status: processResult.exitCode === 0 && !processResult.timedOut ? 'passed' : 'failed',
            exitCode: processResult.exitCode,
            durationSeconds: processResult.durationSeconds,
            outputArtifact: stdoutPath,
            stdoutTail: outputTail(processResult.stdout),
            stderrTail: outputTail(processResult.stderr)
        });
    }

    const artifact = path.join(
        context.run.artifactsDir,
        'validation',
        `result-${context.run.repass}.json`
    );
    await writeJson(artifact, results);
    context.run.validationArtifact = artifact;
    await writeRunRecord(context.repoRoot, context.run);
    return results;
}

async function runReview(
    context: RunContext,
    validation: ValidationResult[]
): Promise<ReviewResult> {
    await transitionRun(context.repoRoot, context.run, 'reviewing');
    const assignment = requireSingleRole(context.loaded.contract, 'reviewer');
    const reviewId = `review-${context.run.repass}`;
    const worktreePath = path.join(context.run.worktreeRoot, reviewId);
    const artifactDir = path.join(context.run.artifactsDir, 'reviews', reviewId);
    await createWorktree(context.repoRoot, worktreePath, context.run.integratedCommit!);
    const integratedPaths = await committedChangedPaths(
        worktreePath,
        context.run.baseCommit,
        context.run.integratedCommit!
    );

    const reported = await invokeReviewer({
        repoRoot: context.repoRoot,
        worktreePath,
        artifactDir,
        runId: context.run.runId,
        baseCommit: context.run.baseCommit,
        reviewedCommit: context.run.integratedCommit,
        contract: context.loaded.contract,
        policy: context.loaded.policy,
        assignment,
        resultSchemaPath: path.join(
            context.repoRoot,
            '.agent',
            'schemas',
            'review-result.schema.json'
        ),
        validate: context.reviewValidator,
        additionalContext: [
            'Integrated files changed:',
            integratedPaths.map(file => `- ${file}`).join('\n'),
            '',
            'Deterministic validation results:',
            formatValidationSummary(validation)
        ].join('\n')
    });

    const reviewerChanges = await changedPaths(worktreePath);
    if (reviewerChanges.length > 0) {
        throw new Error(`Read-only reviewer modified files: ${reviewerChanges.join(', ')}`);
    }

    const review: ReviewResult = {
        ...reported,
        runId: context.run.runId,
        taskId: context.loaded.contract.taskId,
        workerId: reviewId,
        reviewedCommit: context.run.integratedCommit!
    };
    addValidationFindings(review, validation, context.loaded.contract);
    assertStructuredResult(context.reviewValidator, review, `Review ${reviewId}`);

    const resultPath = path.join(artifactDir, 'result.json');
    await writeJson(resultPath, review);
    context.run.reviewArtifacts.push(resultPath);
    context.run.workers.push({
        assignmentId: assignment.id,
        role: 'reviewer',
        attempt: context.run.repass,
        worktreePath,
        status: review.decision === 'blocked' ? 'blocked' : 'completed',
        resultArtifact: resultPath,
        outputCommit: context.run.integratedCommit
    });
    await writeRunRecord(context.repoRoot, context.run);
    return review;
}

function addValidationFindings(
    review: ReviewResult,
    validation: ValidationResult[],
    contract: TaskContract
): void {
    const failed = validation.filter(result => result.status === 'failed');
    if (failed.length === 0) {
        return;
    }

    review.decision = 'changes-required';
    for (const [index, failure] of failed.entries()) {
        review.findings.push({
            id: `F-${900 + index}`,
            severity: 'blocker',
            category: failure.command.includes('test') ? 'testing' : 'correctness',
            criterionIds: contract.acceptanceCriteria.map(criterion => criterion.id),
            rationale: `Required validation command failed: ${failure.command}`,
            evidence: failure.stderrTail || failure.stdoutTail || `Exit code ${String(failure.exitCode)}`,
            repassInstruction: `Fix the root cause of the failing command and rerun: ${failure.command}`
        });
    }
}

function requireCompletedWorkers(results: WorkerResult[]): void {
    const incomplete = results.filter(result => result.status !== 'completed');
    if (incomplete.length > 0) {
        throw new Error(
            `Workers did not complete: ${incomplete.map(result => `${result.workerId}=${result.status}`).join(', ')}`
        );
    }
}

function assertStructuredResult(
    validate: (value: unknown) => string[],
    value: unknown,
    label: string
): void {
    const errors = validate(value);
    if (errors.length > 0) {
        throw new Error(`${label} failed structured validation: ${errors.join('; ')}`);
    }
}

const MAX_VALIDATION_EXCERPT_LENGTH = 1500;

export function formatValidationSummary(validation: ValidationResult[]): string {
    return validation.map(result => [
        `${result.status.toUpperCase()}: ${result.command}`,
        `exitCode=${String(result.exitCode)} durationSeconds=${result.durationSeconds.toFixed(1)}`,
        result.outputArtifact ? `fullOutput=${result.outputArtifact}` : '',
        result.status === 'failed'
            ? formatValidationExcerpt('stderr', result.stderrTail)
            : '',
        result.status === 'failed'
            ? formatValidationExcerpt('stdout', result.stdoutTail)
            : ''
    ].filter(Boolean).join('\n')).join('\n\n');
}

function formatValidationExcerpt(label: string, value: string | undefined): string {
    if (!value) {
        return '';
    }

    const excerpt = outputTail(value, MAX_VALIDATION_EXCERPT_LENGTH);
    const truncationNotice = excerpt.length < value.length
        ? `[showing last ${MAX_VALIDATION_EXCERPT_LENGTH} characters]\n`
        : '';
    return `${label}:\n${truncationNotice}${excerpt}`;
}

function assertWithinWallClock(run: RunRecord, contract: TaskContract): void {
    const elapsedMinutes = (Date.now() - Date.parse(run.startedAt)) / 60_000;
    if (elapsedMinutes > contract.limits.maxWallClockMinutes) {
        throw new Error(`Run exceeded ${contract.limits.maxWallClockMinutes} minute wall-clock budget`);
    }
}

function createRunId(): string {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `${timestamp}-${randomBytes(3).toString('hex')}`;
}

function branchName(taskId: string, workerId: string, runId: string): string {
    return `agent/${sanitize(taskId)}/${sanitize(workerId)}/${sanitize(runId)}`;
}

function sanitize(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]/g, '-');
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function assertAgentProfilesInBase(
    repoRoot: string,
    baseCommit: string,
    workers: WorkerAssignment[]
): Promise<void> {
    const missing: string[] = [];
    for (const worker of workers) {
        const profilePath = agentProfileRepositoryPath(worker.agent);
        if (!await pathExistsAtCommit(repoRoot, baseCommit, profilePath)) {
            missing.push(profilePath);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            `Custom agent profiles must be committed to the pinned base before running: ${missing.join(', ')}`
        );
    }
}

async function provisionDependencies(worktreePath: string): Promise<void> {
    const rootInstall = await runShellCommand('npm ci --ignore-scripts --offline', {
        cwd: worktreePath,
        timeoutMs: 10 * 60_000
    });
    if (rootInstall.exitCode !== 0) {
        throw new Error(
            `Unable to provision root dependencies from the local npm cache: ${outputTail(rootInstall.stderr)}`
        );
    }

    const webviewInstall = await runShellCommand('npm ci --prefix webview-ui --offline', {
        cwd: worktreePath,
        timeoutMs: 10 * 60_000
    });
    if (webviewInstall.exitCode !== 0) {
        throw new Error(
            `Unable to provision webview dependencies from the local npm cache: ${outputTail(webviewInstall.stderr)}`
        );
    }
}
