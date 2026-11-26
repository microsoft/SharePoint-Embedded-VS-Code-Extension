import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    agentProfileRepositoryPath,
    validateAgentProfileContent
} from './agentProfiles';
import {
    createReviewResultValidator,
    createWorkerResultValidator,
    loadContract,
    isSingleEditorFeature,
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
    commitsSince,
    committedChangedPaths,
    createWorkerCommit,
    createWorktree,
    currentCommit,
    diffCheck,
    findRepositoryRoot,
    pathExistsAtCommit,
    readFileAtCommit,
    resolveCommit
} from './git';
import { assertChangedPathsAllowed, matchesAny } from './paths';
import { outputTail, runShellCommand } from './process';
import { runSdkPreflight, SdkPreflightResult } from './sdkPreflight';
import { runValidationCommand } from './validationSandbox';
import { describeReviewStop, IncompleteWorkersError } from './implementationDiagnostics';
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
    onStage?: (stage: ImplementationStage) => void;
    onRecovery?: (role: WorkerAssignment['role'], newOfflinePlan: boolean) => void;
    featureRun?: boolean;
}

export type ImplementationStage = 'contract' | 'copilot-preflight' | 'implementation' |
    'integration' | 'validation' | 'review' | 'repass';

interface RunContext {
    repoRoot: string;
    loaded: LoadedContract;
    run: RunRecord;
    workerValidator: (value: unknown) => string[];
    reviewValidator: (value: unknown) => string[];
    sdkRuntime: SdkPreflightResult;
    onStage?: RunOptions['onStage'];
    onRecovery?: RunOptions['onRecovery'];
    featureRun?: boolean;
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
    options.onStage?.('contract');
    const repoRoot = await findRepositoryRoot(process.cwd());
    const loaded = loadContract(repoRoot, options.contractPath);
    if (/^github-issue-\d+$/.test(loaded.contract.taskId) && !options.featureRun) {
        throw new Error('GitHub feature contracts must be run through run-feature.');
    }
    if (options.featureRun && (!/^sha256:[a-f0-9]{64}$/.test(process.env.AGENT_LOOP_VALIDATION_IMAGE ?? '') ||
        !path.isAbsolute(process.env.AGENT_LOOP_NPM_CACHE ?? ''))) {
        throw new Error('Feature runs require an isolated validation image and an absolute npm cache path.');
    }
    const baseCommit = await resolveCommit(repoRoot, loaded.contract.baseBranch);
    await assertAgentProfilesInBase(repoRoot, baseCommit, loaded.contract.workers);
    options.onStage?.('copilot-preflight');
    const sdkRuntime = await runSdkPreflight({
        repoRoot,
        contract: loaded.contract,
        workers: loaded.contract.workers
    });
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
        sdkRuntime,
        errors: []
    };
    const context: RunContext = {
        repoRoot,
        loaded,
        run,
        workerValidator: createWorkerResultValidator(repoRoot),
        reviewValidator: createReviewResultValidator(repoRoot),
        sdkRuntime,
        onStage: options.onStage,
        onRecovery: options.onRecovery,
        featureRun: options.featureRun
    };

    context.onStage?.('implementation');
    await mkdir(worktreeRoot, { recursive: true });
    await initializeEvidence(repoRoot, loaded, run);

    try {
        await transitionRun(repoRoot, run, 'implementing');
        const implementer = requireSingleRole(loaded.contract, 'implementer');
        const initialWorkers = isSingleEditorFeature(loaded.contract)
            ? [await runRecoverableAssignment(context, implementer, baseCommit, 0)]
            : await runInitialWorkers(context, implementer, requireSingleRole(loaded.contract, 'sdet'));
        requireCompletedWorkers(initialWorkers);

        assertWithinWallClock(run, loaded.contract);
        context.onStage?.('integration');
        await transitionRun(repoRoot, run, 'integrating');
        const integrationWorktree = path.join(worktreeRoot, 'integration');
        run.integrationWorktree = integrationWorktree;
        await createWorktree(repoRoot, integrationWorktree, baseCommit, integrationBranch);
        if (!context.featureRun) await provisionDependencies(integrationWorktree);
        await integrateInitialWorkers(integrationWorktree, baseCommit, initialWorkers);
        run.integratedCommit = await currentCommit(integrationWorktree);
        await writeIntegrationResult(context, initialWorkers[0].startedAt);
        await writeRunRecord(repoRoot, run);
        let validation = await runValidation(context);
        let previousReview: ReviewResult | undefined;
        const evaluate = (results: ValidationResult[]) => evaluateCandidate(
            isSingleEditorFeature(loaded.contract), results, loaded.contract, async () => {
                previousReview = await runReview(context, results, previousReview);
                return previousReview;
            }
        );
        let review = await evaluate(validation);

        let reviewRepairs = 0;
        while (true) {
            const limits = loaded.contract.limits;
            const repair = nextRepair(review, validation, run.repass, reviewRepairs, limits.maxRepasses,
                isSingleEditorFeature(loaded.contract) ? limits.maxReviewRepairs : undefined);
            if (!repair) break;
            assertWithinWallClock(run, loaded.contract);
            if (repair === 'review') reviewRepairs++;
            run.repass += 1;
            context.onStage?.('repass');
            await transitionRun(repoRoot, run, 'repassing');

            const repassWorkers = await runRepassWorkers(context, review.findings, validation);
            requireCompletedWorkers(repassWorkers);
            await integrateInitialWorkers(integrationWorktree, run.integratedCommit!, repassWorkers);

            run.integratedCommit = await currentCommit(integrationWorktree);
            await writeIntegrationResult(context, new Date().toISOString());
            await writeRunRecord(repoRoot, run);
            validation = await runValidation(context);
            review = await evaluate(validation);
        }

        if (validation.some(result => result.status === 'failed')) {
            await transitionRun(repoRoot, run, 'blocked', 'Required validation still fails after repass budget');
            return run;
        }
        if (review.decision !== 'pass') {
            run.publicStopReason = describeReviewStop(review, run.repass, reviewRepairs);
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

        run.reviewAdvisories = review.advisories;
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
    if (context.featureRun) {
        return runWorkerBatch(context, [implementer, sdet].map(assignment =>
            () => runRecoverableAssignment(context, assignment, context.run.baseCommit, 0)));
    }
    let initial: WorkerResult[];
    if (context.loaded.contract.limits.maxConcurrentWorkers > 1) {
        initial = await Promise.all([
            runEditingAssignment(context, implementer, context.run.baseCommit, 0),
            runEditingAssignment(context, sdet, context.run.baseCommit, 0)
        ]);
    } else {
        initial = [
            await runEditingAssignment(context, implementer, context.run.baseCommit, 0),
            await runEditingAssignment(context, sdet, context.run.baseCommit, 0)
        ];
    }

    const results = [...initial];
    let implementation = initial.find(result => result.role === 'implementer')!;
    for (
        let attempt = 1;
        implementation.status === 'blocked' && implementation.approvalRequests.length === 0 &&
        implementation.outputCommit &&
        attempt <= context.loaded.contract.limits.maxRepasses;
        attempt++
    ) {
        assertWithinWallClock(context.run, context.loaded.contract);
        implementation = await runEditingAssignment(
            context,
            implementer,
            implementation.outputCommit,
            attempt,
            formatContinuationContext(implementation),
            'continuation'
        );
        results.push(implementation);
    }
    return results;
}

async function runRepassWorkers(
    context: RunContext,
    findings: ReviewFinding[],
    validation: ValidationResult[]
): Promise<WorkerResult[]> {
    const implementer = requireSingleRole(context.loaded.contract, 'implementer');
    const failedValidationContext = formatValidationSummary(validation);
    if (isSingleEditorFeature(context.loaded.contract)) {
        if (!findings.length) throw new Error('Repass was requested without an actionable finding');
        return [await runRecoverableAssignment(context, implementer, context.run.integratedCommit!,
            context.run.repass, formatRepassContext(findings, failedValidationContext), [context.run.artifactsDir])];
    }
    const sdet = requireSingleRole(context.loaded.contract, 'sdet');
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

    const work: Array<() => Promise<WorkerResult>> = [];
    if (implementerFindings.length > 0) {
        work.push(() => runRecoverableAssignment(
            context,
            implementer,
            context.run.integratedCommit!,
            context.run.repass,
            formatRepassContext(implementerFindings, failedValidationContext),
            [context.run.artifactsDir]
        ));
    }
    if (sdetFindings.length > 0) {
        work.push(() => runRecoverableAssignment(
            context,
            sdet,
            context.run.integratedCommit!,
            context.run.repass,
            formatRepassContext(sdetFindings, failedValidationContext),
            [context.run.artifactsDir]
        ));
    }

    if (work.length === 0) {
        throw new Error('Repass was requested without an actionable finding');
    }

    return runWorkerBatch(context, work);
}

async function runWorkerBatch(context: RunContext, work: Array<() => Promise<WorkerResult>>): Promise<WorkerResult[]> {
    if (context.loaded.contract.limits.maxConcurrentWorkers > 1) {
        const settled = await Promise.allSettled(work.map(worker => worker()));
        return settled.map(result => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
        });
    }
    const results: WorkerResult[] = [];
    for (const worker of work) {
        results.push(await worker());
    }
    return results;
}

export async function recoverWorker(
    baseCommit: string,
    retryLimit: number,
    invoke: (base: string, retry: number, prior: WorkerResult | undefined, offlinePlan: boolean) => Promise<WorkerResult>,
    beforeRetry: (newOfflinePlan: boolean) => void
): Promise<WorkerResult> {
    let base = baseCommit;
    let prior: WorkerResult | undefined;
    let offlinePlan = false;
    let newOfflinePlan = false;
    for (let retry = 0; ; retry++) {
        if (retry) beforeRetry(newOfflinePlan);
        newOfflinePlan = false;
        let result: WorkerResult;
        try {
            result = await invoke(base, retry, prior, offlinePlan);
        } catch (error) {
            const detail = errorMessage(error);
            if (retry >= retryLimit || /denied authority|outside its authority/i.test(detail) ||
                !/^(?:SDK worker returned malformed JSON|SDK worker final response must be|SDK worker result failed structured validation|Timeout waiting for)|\b(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN)\b/i.test(detail)) throw error;
            continue;
        }
        if (retry >= retryLimit || result.blockerCode === 'budget-exhausted' ||
            (result.blockerCode === 'edit-scope' && !result.approvalRequests.length)) return result;
        if (result.approvalRequests.length) {
            if (offlinePlan || result.approvalRequests.some(request => request.category.trim().toLowerCase() === 'budget')) return result;
            // Start a new plan from the last scoped checkpoint, not from the requesting worker's edits or instructions.
            prior = undefined;
            offlinePlan = true;
            newOfflinePlan = true;
            continue;
        }
        if (result.status === 'completed') return result;
        if (result.outputCommit) base = result.outputCommit;
        prior = result;
    }
}

function runRecoverableAssignment(
    context: RunContext, assignment: WorkerAssignment, base: string, attempt: number,
    additionalContext?: string, readRoots?: string[]
): Promise<WorkerResult> {
    const retryLimit = context.featureRun ? context.loaded.contract.limits.maxRepasses : 0;
    return recoverWorker(base, retryLimit, (checkpoint, retry, prior, offlinePlan) => {
        const recovery = retry ? (prior ? formatContinuationContext(prior, context.featureRun)
            : !offlinePlan ? 'The previous invocation did not return a usable result. Complete the assignment and return the required structured result.' : undefined) : undefined;
        const alternative = offlinePlan ? [
            'A previous plan required permission that was not granted. Abandon that plan. Your permissions have not changed.',
            'Use only existing repository interfaces, scoped source edits, and offline synthetic fixtures. For a Graph feature, implement real request and response handling in the product and mock the service only in tests.',
            'Do not perform or work around the restricted operation, skip requirements, or substitute a mock for production behavior.',
            'If the real feature cannot be implemented within the original contract, report the essential approval category and affected criteria.'
        ].join('\n') : undefined;
        return runEditingAssignment(context, assignment, checkpoint, attempt,
            [additionalContext, recovery, alternative].filter(Boolean).join('\n\n') || undefined, 'repass', readRoots, retry);
    }, newOfflinePlan => {
        assertWithinWallClock(context.run, context.loaded.contract);
        context.onRecovery?.(assignment.role, newOfflinePlan);
    });
}

async function runEditingAssignment(
    context: RunContext,
    assignment: WorkerAssignment,
    baseCommit: string,
    attempt: number,
    additionalContext?: string,
    attemptKind: 'repass' | 'continuation' = 'repass',
    readRoots?: string[],
    retry = 0
): Promise<WorkerResult> {
    const suffix = attempt === 0 ? 'initial' : `${attemptKind}-${attempt}`;
    const invocationId = `${assignment.id}-${suffix}${retry ? `-retry-${retry}` : ''}`;
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
    if (!context.featureRun) await provisionDependencies(worktreePath);

    try {
        const reported = await invokeEditingWorker({
            repoRoot: context.repoRoot,
            worktreePath,
            artifactDir: workerArtifactDir,
            readRoots,
            runId: context.run.runId,
            baseCommit,
            contract: context.loaded.contract,
            policy: context.loaded.policy,
            assignment,
            sdkRuntime: context.sdkRuntime,
            trustedFeatureInstructions: context.featureRun,
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

        const outputCommit = reported.approvalRequests.length === 0 && (
            reported.status === 'completed' ||
            (reported.status === 'blocked' && filesChanged.length > 0)
        )
            ? await createWorkerCommit(
                worktreePath,
                context.loaded.contract.taskId,
                assignment.id,
                attempt
            )
            : null;
        const result: WorkerResult = {
            ...reported,
            status: reported.approvalRequests.length > 0 ? 'blocked' : reported.status,
            runId: context.run.runId,
            taskId: context.loaded.contract.taskId,
            workerId: invocationId,
            role: assignment.role === 'sdet' ? 'sdet' : 'implementer',
            startedAt,
            finishedAt: new Date().toISOString(),
            baseCommit,
            outputCommit,
            filesChanged,
            artifacts: [...reported.artifacts, ...buildWorkerSdkArtifacts(workerArtifactDir)]
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

export function buildWorkerSdkArtifacts(
    workerArtifactDir: string
): WorkerResult['artifacts'] {
    return [
        {
            type: 'copilot-sdk-events',
            path: path.join(workerArtifactDir, 'events.ndjson'),
            description: 'Structured Copilot SDK session events'
        },
        {
            type: 'copilot-sdk-metadata',
            path: path.join(workerArtifactDir, 'metadata.json'),
            description: 'Copilot SDK runtime and session metadata'
        }
    ];
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

export function featureTestNames(paths: string[]): { nativeScenarios: string[]; error?: string } {
    const nativeScenarios: string[] = [];
    for (const file of paths) {
        if (!/^(?:src\/test|ui-tests)\//.test(file) || !/\.[cm]?[jt]sx?$/.test(file)) continue;
        const name = path.posix.basename(file);
        if (/(?:^|[-_.])(?:github[-_.]?)?issue[-_.]?#?\d+(?=[-_.]|$)|^#?\d+(?:\.|$)/i.test(name)) {
            return { nativeScenarios: [], error: `Rename ${file} for the behavior it tests rather than the issue number.` };
        }
        if (path.posix.dirname(file) !== 'src/test/native' || !name.endsWith('.ts') ||
            ['captureWorkbench.ts', 'workbench-smoke.ts'].includes(name)) continue;
        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+\.scenario\.ts$/.test(name)) {
            return { nativeScenarios: [], error: `Name ${file} like container-creation-confirmation.scenario.ts or put shared helpers under src/test/native/helpers/.` };
        }
        nativeScenarios.push(name);
    }
    return { nativeScenarios: nativeScenarios.sort() };
}

async function runValidation(context: RunContext): Promise<ValidationResult[]> {
    context.onStage?.('validation');
    await transitionRun(context.repoRoot, context.run, 'validating');
    const results: ValidationResult[] = [];
    const removeClientDeclaration = context.featureRun ? async () => undefined
        : await ensureValidationClientDeclaration(context.run.integrationWorktree!);

    try {
        const names = context.featureRun
            ? featureTestNames(await committedChangedPaths(context.run.integrationWorktree!, context.run.baseCommit, context.run.integratedCommit, true))
            : { nativeScenarios: [] };
        for (const check of context.loaded.contract.requiredChecks) {
            assertWithinWallClock(context.run, context.loaded.contract);
            if (names.error) {
                results.push({ command: 'Feature test filenames', status: 'failed', exitCode: 1, durationSeconds: 0, stderrTail: names.error });
                break;
            }
            const checkDir = path.join(
                context.run.artifactsDir,
                'validation',
                `attempt-${context.run.repass}`
            );
            const stdoutPath = path.join(checkDir, `${check.id}.stdout.log`);
            const stderrPath = path.join(checkDir, `${check.id}.stderr.log`);
            const evidenceRoot = process.env.AGENT_LOOP_UX_EVIDENCE_ROOT;
            let uxEvidence: { file: string; taskId: string; nativeScenarios: string[] } | undefined;
            if (context.featureRun && check.id === 'ui' && evidenceRoot && path.isAbsolute(evidenceRoot)) {
                const file = path.join(evidenceRoot, `attempt-${context.run.repass}.png`);
                await writeFile(file, '', { flag: 'wx' });
                await chmod(file, 0o666);
                uxEvidence = { file, taskId: context.loaded.contract.taskId, nativeScenarios: names.nativeScenarios };
            }
            const processResult = await runValidationCommand(check.command, {
                cwd: context.run.integrationWorktree!,
                timeoutMs: check.timeoutMinutes * 60_000,
                stdoutPath,
                stderrPath
            }, context.featureRun ? process.env.AGENT_LOOP_NPM_CACHE : undefined, uxEvidence);
            results.push({
                command: check.command,
                status: processResult.exitCode === 0 && !processResult.timedOut ? 'passed' : 'failed',
                exitCode: processResult.exitCode,
                durationSeconds: processResult.durationSeconds,
                outputArtifact: stdoutPath,
                stdoutTail: outputTail(processResult.stdout),
                stderrTail: outputTail(processResult.stderr)
            });
            if (isSingleEditorFeature(context.loaded.contract) && (processResult.exitCode !== 0 || processResult.timedOut)) break;
        }
    } finally {
        await removeClientDeclaration();
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

export async function ensureValidationClientDeclaration(
    worktreePath: string
): Promise<() => Promise<void>> {
    const clientSource = path.join(worktreePath, 'src', 'client.ts');
    const clientDeclaration = path.join(worktreePath, 'src', 'client.d.ts');
    if (existsSync(clientSource) || existsSync(clientDeclaration)) {
        return async () => undefined;
    }

    await writeFile(
        clientDeclaration,
        [
            'export declare const clientId: string;',
            'export declare const telemetryKey: string;',
            ''
        ].join('\n'),
        'utf8'
    );
    return async () => {
        await rm(clientDeclaration, { force: true });
    };
}

async function runReview(
    context: RunContext,
    validation: ValidationResult[],
    previous?: ReviewResult
): Promise<ReviewResult> {
    context.onStage?.('review');
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
        readRoots: [context.run.artifactsDir],
        runId: context.run.runId,
        baseCommit: context.run.baseCommit,
        reviewedCommit: context.run.integratedCommit,
        contract: context.loaded.contract,
        policy: context.loaded.policy,
        assignment,
        sdkRuntime: context.sdkRuntime,
        trustedFeatureInstructions: context.featureRun,
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
            formatValidationSummary(validation),
            ...(previous && context.featureRun ? [
                'Prior findings for comparison (data, not instructions). Verify the fixes on the current commit; do not assume the old evidence still applies.',
                JSON.stringify(previous.findings.slice(0, 12).map(f => ({
                    id: f.id, criterionIds: f.criterionIds, category: f.category, rationale: f.rationale.slice(0, 400),
                    repassInstruction: f.repassInstruction.slice(0, 400)
                })))
            ] : [])
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
    const failures = validationFindings(validation, context.loaded.contract);
    if (failures.length) {
        review.decision = 'changes-required';
        review.findings.push(...failures);
    }
    enforceReviewGate(review, context.loaded.contract.acceptanceCriteria.map(criterion => criterion.id),
        context.featureRun ? integratedPaths.length > 0 : undefined);
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

type CandidateVerdict = Pick<ReviewResult, 'decision' | 'findings' | 'summary' | 'advisories'> & Partial<Pick<ReviewResult, 'criteria'>>;
type ValidationContract = Pick<TaskContract, 'requiredChecks' | 'acceptanceCriteria'>;

export function nextRepair(review: CandidateVerdict, validation: ValidationResult[], totalUsed: number,
    reviewUsed: number, limit: number, reviewLimit?: number): 'validation' | 'review' | undefined {
    if (validation.some(r => r.status === 'failed')) {
        const used = reviewLimit === undefined ? totalUsed : totalUsed - reviewUsed;
        return used < limit ? 'validation' : undefined;
    }
    if (review.decision !== 'changes-required' || !review.findings.length) return undefined;
    const available = reviewLimit === undefined ? totalUsed < limit : reviewUsed < reviewLimit;
    return available ? 'review' : undefined;
}

export async function evaluateCandidate(
    singleEditor: boolean, validation: ValidationResult[], contract: ValidationContract,
    review: () => Promise<CandidateVerdict>
): Promise<CandidateVerdict> {
    if (singleEditor) {
        const findings = validationFindings(validation, contract);
        if (findings.length) return { decision: 'changes-required', findings, summary: 'A required check failed before independent review.' };
        if (!contract.requiredChecks.every(check =>
            validation.some(result => result.command === check.command && result.status === 'passed'))) {
            throw new Error('Required validation evidence is incomplete; cannot start independent review.');
        }
    }
    return review();
}

function validationFindings(
    validation: ValidationResult[],
    contract: ValidationContract
): ReviewFinding[] {
    return validation.filter(result => result.status === 'failed').map((failure, index) => ({
        id: `F-${900 + index}`,
        severity: 'blocker',
        category: failure.command.includes('test') ? 'testing' : 'correctness',
        criterionIds: contract.acceptanceCriteria.map(criterion => criterion.id),
        rationale: `Required validation command failed: ${failure.command}`,
        evidence: failure.stderrTail || failure.stdoutTail || `Exit code ${String(failure.exitCode)}`,
        repassInstruction: `Fix the root cause of the failing command and rerun: ${failure.command}`
    }));
}

function requireCompletedWorkers(results: WorkerResult[]): void {
    const incomplete = selectTerminalWorkerResults(results)
        .filter(result => result.status !== 'completed');
    if (incomplete.length > 0) {
        throw new IncompleteWorkersError(incomplete);
    }
}

export async function integrateInitialWorkers(
    worktreePath: string, baseCommit: string, results: WorkerResult[]
): Promise<void> {
    for (const worker of selectTerminalWorkerResults(results)) {
        if (worker.outputCommit) {
            for (const commit of await commitsSince(worktreePath, baseCommit, worker.outputCommit)) {
                await cherryPick(worktreePath, commit);
            }
        }
    }
}

export function enforceReviewGate(review: ReviewResult, requiredCriteria: string[], hasFeatureChanges?: boolean): void {
    if (review.decision !== 'pass') {
        return;
    }
    const accepted = new Set(review.criteria.filter(criterion => criterion.status === 'satisfied' && criterion.evidence.trim())
        .map(criterion => criterion.id));
    if (review.criteria.length !== requiredCriteria.length || !requiredCriteria.every(id => accepted.has(id)) ||
        review.findings.some(finding => finding.severity === 'blocker' || finding.severity === 'high')) {
        review.decision = 'blocked';
        review.summary = 'Reviewer reported pass without satisfying every acceptance criterion or resolving all high-severity findings.';
    } else if (hasFeatureChanges === false) {
        review.decision = 'changes-required';
        review.summary = 'There is no change against the feature run base.';
        review.findings.push({
            id: 'F-990', severity: 'blocker', category: 'correctness', criterionIds: requiredCriteria,
            evidence: 'The integrated tree has no changed paths compared with the approved base.',
            rationale: 'There is no diff to review in a PR.',
            repassInstruction: 'Implement missing behavior or genuinely missing regression coverage. If the base already satisfies the brief with coverage, report that instead of inventing edits.'
        });
    }
}

export function selectTerminalWorkerResults(results: WorkerResult[]): WorkerResult[] {
    const latestByRole = new Map<WorkerResult['role'], WorkerResult>();
    for (const result of results) {
        latestByRole.set(result.role, result);
    }
    return [...latestByRole.values()];
}

export function formatContinuationContext(result: WorkerResult, featureRun = false): string {
    const remaining = result.criteria.filter(criterion =>
        criterion.status === 'blocked' || criterion.status === 'not-satisfied'
    );
    return [
        'This is a bounded continuation of your prior implementation pass.',
        result.outputCommit ? `The orchestrator checkpointed your prior scoped changes at commit ${result.outputCommit}.`
            : 'This invocation starts from the last trusted checkpoint or assignment base; uncommitted edits were not carried forward.',
        'Preserve valid checkpointed changes and complete the remaining contract criteria.',
        ...(featureRun && result.blockerCode === 'missing-context' && !result.approvalRequests.length ? [
            'Resolve the reported missing context before repeating the same approach: inspect the closest existing feature.',
            'If the criteria allow multiple implementations, choose a reversible default, record the assumption and rationale, and implement it now. Do not ask the PM to choose.',
            'If no in-scope choice satisfies all explicit criteria, identify the conflicting criteria or missing essential prerequisite. Do not invent permissions or claim an unmet criterion passed.'
        ] : []),
        '',
        'Prior summary:',
        result.summary,
        '',
        'Remaining criteria:',
        JSON.stringify(remaining, null, 2),
        '',
        'Prior risks:',
        JSON.stringify(result.risks, null, 2),
        '',
        'Prior approval requests:',
        JSON.stringify(result.approvalRequests, null, 2)
    ].join('\n');
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
            continue;
        }
        validateAgentProfileContent(
            await readFileAtCommit(repoRoot, baseCommit, profilePath),
            worker,
            `${profilePath} at ${baseCommit}`
        );
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
