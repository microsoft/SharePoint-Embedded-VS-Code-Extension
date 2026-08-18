export type WorkerRole = 'implementer' | 'sdet' | 'integrator' | 'reviewer';

export interface AcceptanceCriterion {
    id: string;
    description: string;
    evidence: string;
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
    requiredChecks: RequiredCheck[];
    workers: WorkerAssignment[];
    authority: {
        policyFile: string;
        approvalRequiredFor: string[];
    };
    limits: {
        maxConcurrentWorkers: number;
        maxRepasses: number;
        maxWallClockMinutes: number;
        maxMinutesPerWorker: number;
        maxAiCreditsPerWorker: number;
        maxAutopilotContinues: number;
        maxTokensPerWorker?: number;
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
    summary: string;
    criteria: Array<{
        id: string;
        status: 'satisfied' | 'not-satisfied' | 'not-verifiable';
        evidence: string;
    }>;
    findings: ReviewFinding[];
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
    reviewArtifacts: string[];
    errors: string[];
}

export interface LoadedContract {
    contract: TaskContract;
    policy: AuthorityPolicy;
    contractPath: string;
    policyPath: string;
}
