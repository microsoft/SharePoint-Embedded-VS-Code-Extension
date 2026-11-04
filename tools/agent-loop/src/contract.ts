import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { validateAgentProfile } from './agentProfiles';
import { mutableScopesOverlap, resolveInside } from './paths';
import {
    AuthorityPolicy,
    LoadedContract,
    ReviewResult,
    TaskContract,
    WorkerAssignment,
    WorkerResult
} from './types';

export function loadContract(repoRoot: string, contractArgument: string): LoadedContract {
    const contractPath = resolveContractPath(repoRoot, contractArgument);
    const schemaPath = path.join(repoRoot, '.agent', 'schemas', 'task-contract.schema.json');
    const contract = readJson<TaskContract>(contractPath);
    const schema = readJson<object>(schemaPath);
    const validate = createAjv().compile(schema);

    assertValid(validate, contract, 'Task contract');

    const policyPath = resolveInside(repoRoot, contract.authority.policyFile);
    const policy = readJson<AuthorityPolicy>(policyPath);
    validateContractInvariants(repoRoot, contract, policy);

    return {
        contract,
        policy,
        contractPath,
        policyPath
    };
}

export function createWorkerResultValidator(repoRoot: string): (value: unknown) => string[] {
    return createValidator(path.join(repoRoot, '.agent', 'schemas', 'worker-result.schema.json'));
}

export function createReviewResultValidator(repoRoot: string): (value: unknown) => string[] {
    return createValidator(path.join(repoRoot, '.agent', 'schemas', 'review-result.schema.json'));
}

export function validateContractInvariants(
    repoRoot: string,
    contract: TaskContract,
    policy: AuthorityPolicy
): void {
    if (policy.schemaVersion !== '1.0') {
        throw new Error(`Unsupported authority policy version: ${String(policy.schemaVersion)}`);
    }
    if (!policy.filesystem.enforceTaskAllowedPaths) {
        throw new Error('Authority policy must enforce task allowed paths');
    }
    if (
        policy.git.allowPush ||
        policy.git.allowMerge ||
        policy.git.allowProtectedBranchWrite ||
        policy.cloud.allowLiveMicrosoftGraph ||
        policy.cloud.allowLiveSharePoint ||
        policy.cloud.allowLiveAzure
    ) {
        throw new Error('Authority policy attempts to grant prohibited repository or cloud access');
    }
    if (policy.network.mode !== 'deny') {
        throw new Error('Phase 3 authority policy must deny worker network access');
    }
    if (policy.mcp.mode !== 'deny') {
        throw new Error('Phase 3 authority policy must deny MCP servers');
    }
    if (
        !policy.prohibited.includes('blanket-permission-bypass') ||
        !policy.prohibited.includes('autonomous-merge')
    ) {
        throw new Error('Authority policy must prohibit blanket permissions and autonomous merge');
    }

    const workerIds = new Set<string>();
    const agentNames = new Set<string>();
    for (const worker of contract.workers) {
        if (workerIds.has(worker.id)) {
            throw new Error(`Duplicate worker ID: ${worker.id}`);
        }
        workerIds.add(worker.id);
        if (agentNames.has(worker.agent)) {
            throw new Error(`Duplicate custom agent assignment: ${worker.agent}`);
        }
        agentNames.add(worker.agent);

        const rolePath = resolveInside(repoRoot, worker.roleFile);
        if (!existsSync(rolePath)) {
            throw new Error(`Worker role file does not exist: ${worker.roleFile}`);
        }
        validateAgentProfile(repoRoot, worker);
    }

    for (const worker of contract.workers) {
        for (const dependency of worker.dependsOn) {
            if (!workerIds.has(dependency)) {
                throw new Error(`Worker ${worker.id} depends on unknown worker ${dependency}`);
            }
        }
    }
    assertAcyclic(contract.workers);

    const implementer = requireSingleRole(contract, 'implementer');
    const sdet = requireSingleRole(contract, 'sdet');
    const integrator = requireSingleRole(contract, 'integrator');
    const reviewer = requireSingleRole(contract, 'reviewer');

    if (implementer.dependsOn.length > 0 || sdet.dependsOn.length > 0) {
        throw new Error('Implementer and SDET must start independently from the base commit');
    }
    if (!implementer.mayEdit || !sdet.mayEdit) {
        throw new Error('Implementer and SDET must have bounded edit scopes');
    }
    if (mutableScopesOverlap(implementer.allowedPaths, sdet.allowedPaths)) {
        throw new Error('Parallel implementer and SDET path scopes overlap');
    }
    if (!integrator.dependsOn.includes(implementer.id) || !integrator.dependsOn.includes(sdet.id)) {
        throw new Error('Integrator must depend on implementer and SDET');
    }
    if (
        reviewer.mayEdit ||
        reviewer.isolation !== 'read-only-checkout' ||
        !reviewer.dependsOn.includes(integrator.id)
    ) {
        throw new Error('Reviewer must be read-only and depend on integration');
    }

    for (const check of contract.requiredChecks) {
        if (!policy.commands.allowExact.includes(check.command)) {
            throw new Error(`Required check is not allowed by the authority policy: ${check.command}`);
        }
    }
}

export function requireSingleRole(contract: TaskContract, role: WorkerAssignment['role']): WorkerAssignment {
    const matching = contract.workers.filter(worker => worker.role === role);
    if (matching.length !== 1) {
        throw new Error(`Contract must define exactly one ${role}; found ${matching.length}`);
    }
    return matching[0];
}

function createValidator(schemaPath: string): (value: unknown) => string[] {
    const validate = createAjv().compile(readJson<object>(schemaPath));
    return value => {
        const valid = validate(value);
        return valid ? [] : formatErrors(validate.errors);
    };
}

function createAjv(): Ajv {
    const instance = new Ajv({
        allErrors: true,
        strict: false
    });
    instance.addFormat('date-time', {
        type: 'string',
        validate: value =>
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
            !Number.isNaN(Date.parse(value))
    });
    return instance;
}

function resolveContractPath(repoRoot: string, contractArgument: string): string {
    const absolute = path.isAbsolute(contractArgument)
        ? path.resolve(contractArgument)
        : path.resolve(process.cwd(), contractArgument);
    return resolveInside(repoRoot, path.relative(repoRoot, absolute));
}

function readJson<T>(filePath: string): T {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8')) as T;
    } catch (error) {
        throw new Error(`Unable to read JSON file ${filePath}: ${errorMessage(error)}`);
    }
}

function assertValid(validate: ValidateFunction, value: unknown, label: string): void {
    if (!validate(value)) {
        throw new Error(`${label} is invalid:\n${formatErrors(validate.errors).join('\n')}`);
    }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
    return (errors ?? []).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
}

function assertAcyclic(workers: WorkerAssignment[]): void {
    const byId = new Map(workers.map(worker => [worker.id, worker]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (workerId: string): void => {
        if (visiting.has(workerId)) {
            throw new Error(`Worker dependency cycle includes ${workerId}`);
        }
        if (visited.has(workerId)) {
            return;
        }

        visiting.add(workerId);
        for (const dependency of byId.get(workerId)?.dependsOn ?? []) {
            visit(dependency);
        }
        visiting.delete(workerId);
        visited.add(workerId);
    };

    for (const worker of workers) {
        visit(worker.id);
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function isWorkerResult(value: unknown, validate: (value: unknown) => string[]): value is WorkerResult {
    return validate(value).length === 0;
}

export function isReviewResult(value: unknown, validate: (value: unknown) => string[]): value is ReviewResult {
    return validate(value).length === 0;
}
