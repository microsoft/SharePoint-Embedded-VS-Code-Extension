export type WorkerRole = 'implementer' | 'sdet' | 'integrator' | 'reviewer';

export interface AcceptanceScenario {
    id: string;
    description: string;
}

export interface AcceptanceCriterion {
    id: string;
    description: string;
    evidence: string;
    scenarios?: AcceptanceScenario[];
}

export type ScenarioObservation = 'verified' | 'not-implemented' | 'not-covered' | 'assertion-failed' |
    'build-failed' | 'fixture-unavailable' | 'not-verifiable';

export interface ProposalRevision {
    branch: string;
    modifications: string;
    commit?: string;
    parent?: string;
}

export interface RequiredCheck {
    id: string;
    command: string;
    timeoutMinutes: number;
}

export interface WorkerAssignment {
    id: string;
    role: WorkerRole;
    agent: string;
    roleFile: string;
    isolation: 'git-worktree' | 'read-only-checkout';
    mayEdit: boolean;
    allowedPaths: string[];
    dependsOn: string[];
    contextInputs: string[];
}

export interface TaskContract {
    $schema?: string;
    schemaVersion: '1.0';
    taskId: string;
    title: string;
    goal: string;
    baseBranch: string;
    allowedPaths: string[];
    deniedPaths: string[];
    acceptanceCriteria: AcceptanceCriterion[];
    proposalRevision?: ProposalRevision;
    requiredChecks: RequiredCheck[];
    workers: WorkerAssignment[];
    authority: {
        policyFile: string;
        approvalRequiredFor: string[];
    };
    limits: {
        maxConcurrentWorkers: number;
        maxRepasses: number;
        maxReviewRepairs?: number;
        maxWallClockMinutes: number;
        maxMinutesPerWorker: number;
        maxAiCreditsPerWorker: number;
    };
    requiredArtifacts: string[];
}

export interface AuthorityPolicy {
    schemaVersion: '1.0';
    policyId: string;
    description: string;
    filesystem: {
        root: string;
        enforceTaskAllowedPaths: boolean;
        deny: string[];
    };
    commands: {
        allowExact: string[];
        allowPrefixes: string[];
        denyPrefixes: string[];
    };
    network: {
        mode: 'deny' | 'allowlist';
        allowLoopback: boolean;
        allowedHosts: string[];
    };
    mcp: {
        mode: 'deny';
        disabledServers: string[];
    };
    git: {
        allowWorkerBranchCommit: boolean;
        allowPush: boolean;
        allowMerge: boolean;
        allowProtectedBranchWrite: boolean;
    };
    cloud: {
        allowLiveMicrosoftGraph: boolean;
        allowLiveSharePoint: boolean;
        allowLiveAzure: boolean;
    };
    approvalRequiredFor: string[];
    prohibited: string[];
}

export interface CriterionResult {
    id: string;
    status: 'satisfied' | 'not-satisfied' | 'not-applicable' | 'blocked';
    evidence: string;
    scenarios?: Array<{
        id: string;
        status: 'satisfied' | 'not-satisfied' | 'not-applicable' | 'blocked';
        observed: ScenarioObservation;
    }>;
}

export interface ValidationResult {
    command: string;
    status: 'passed' | 'failed' | 'not-run';
    exitCode: number | null;
    durationSeconds: number;
    outputArtifact?: string;
    stdoutTail?: string;
    stderrTail?: string;
}

export interface WorkerResult {
    schemaVersion: '1.0';
    runId: string;
    taskId: string;
    workerId: string;
    role: 'implementer' | 'sdet' | 'integrator';
    status: 'completed' | 'blocked' | 'failed';
    startedAt: string;
    finishedAt: string;
    baseCommit: string;
    outputCommit: string | null;
    summary: string;
    criteria: CriterionResult[];
    filesChanged: string[];
    validations: ValidationResult[];
    blockerCode?: 'missing-context' | 'edit-scope' | 'fixture-unavailable' | 'implementation-incomplete' | 'budget-exhausted';
    artifacts: Array<{
        type: string;
        path: string;
        description: string;
    }>;
    risks: string[];
    approvalRequests: Array<{
        category: string;
        reason: string;
    }>;
}

export interface ReviewFinding {
    id: string;
    severity: 'blocker' | 'high' | 'medium' | 'low';
    category: 'correctness' | 'security' | 'reliability' | 'testing' | 'architecture' | 'contract';
    file?: string;
    line?: number;
    criterionIds: string[];
    rationale: string;
    evidence: string;
    repassInstruction: string;
}

export interface ReviewResult {
    schemaVersion: '1.0';
    runId: string;
    taskId: string;
    workerId: string;
    reviewedCommit: string;
    decision: 'pass' | 'changes-required' | 'blocked';
    advisories?: Array<'omit-optional-preview' | 'optional-hardening'>;
    summary: string;
    criteria: Array<{
        id: string;
        status: 'satisfied' | 'not-satisfied' | 'not-verifiable';
        evidence: string;
        scenarios?: Array<{
            id: string;
            status: 'satisfied' | 'not-satisfied' | 'not-verifiable';
            observed: ScenarioObservation;
        }>;
    }>;
    findings: ReviewFinding[];
}

export interface WorkerProgress {
    workerId: string;
    status: WorkerResult['status'];
    blockerCode?: WorkerResult['blockerCode'];
    // Criterion and scenario IDs that remained open, each with a controlled observation.
    open: Array<{ id: string; observed?: ScenarioObservation }>;
    baseCommit: string;
    checkpointCommit: string | null;
    filesChanged: number;
    newCode: boolean;
    evidenceFingerprint: string;
    noProgress: boolean;
}

export type RunPhase =
    | 'created'
    | 'implementing'
    | 'integrating'
    | 'validating'
    | 'reviewing'
    | 'repassing'
    | 'awaiting-human-acceptance'
    | 'blocked'
    | 'failed';

export interface WorkerRunRecord {
    assignmentId: string;
    role: WorkerRole;
    attempt: number;
    worktreePath: string;
    branchName?: string;
    status: 'running' | 'completed' | 'blocked' | 'failed';
    resultArtifact?: string;
    outputCommit?: string | null;
}

export interface RunRecord {
    schemaVersion: '1.0';
    runId: string;
    taskId: string;
    contractPath: string;
    repoRoot: string;
    baseCommit: string;
    integrationBranch: string;
    integrationWorktree?: string;
    integratedCommit?: string;
    phase: RunPhase;
    repass: number;
    startedAt: string;
    updatedAt: string;
    artifactsDir: string;
    worktreeRoot: string;
    workers: WorkerRunRecord[];
    validationArtifact?: string;
    publicStopReason?: string;
    reviewAdvisories?: ReviewResult['advisories'];
    reviewArtifacts: string[];
    proposalSeedCommit?: string;
    progress?: WorkerProgress[];
    sdkRuntime: {
        sdkVersion: string;
        cliPath: string;
        cliVersion: string;
        model: string;
        reasoningEffort?: string;
        availableTools: string[];
    };
    errors: string[];
}

export interface LoadedContract {
    contract: TaskContract;
    policy: AuthorityPolicy;
    contractPath: string;
    policyPath: string;
}
