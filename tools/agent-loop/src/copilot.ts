import { appendFile, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { writeJson, writeText } from './evidence';
import { matchesAny, normalizeRepositoryPath } from './paths';
import {
    buildSdkEnvironment,
    createSdkClient,
    type SdkAssistantMessage,
    type SdkClientFactory,
    type SdkPreflightResult,
    type SdkSessionEvent
} from './sdkPreflight';
import {
    AuthorityPolicy,
    ReviewFinding,
    ReviewResult,
    TaskContract,
    WorkerAssignment,
    WorkerResult
} from './types';

export const SDK_TOOLS = {
    readOnly: ['view', 'grep', 'glob'],
    editing: ['view', 'grep', 'glob', 'create', 'edit']
} as const;

export interface InvocationOptions<T> {
    repoRoot: string;
    worktreePath: string;
    artifactDir: string;
    runId: string;
    baseCommit: string;
    reviewedCommit?: string;
    contract: TaskContract;
    policy: AuthorityPolicy;
    assignment: WorkerAssignment;
    resultSchemaPath: string;
    validate: (value: unknown) => string[];
    sdkRuntime: SdkPreflightResult;
    additionalContext?: string;
}

interface PermissionAudit {
    requestKind: string;
    result: SdkPermissionResult;
}

interface SdkPermissionRequest {
    kind: string;
    managedApprovalRequired?: boolean;
    path?: string;
    fileName?: string;
    requestSandboxBypass?: boolean;
}

type SdkPermissionResult =
    | { kind: 'approve-once' }
    | { kind: 'reject'; feedback: string };

type SdkPermissionHandler = (
    request: SdkPermissionRequest,
    invocation: { sessionId: string; managedSettingsEnabled?: boolean }
) => SdkPermissionResult | Promise<SdkPermissionResult>;

interface SdkInvocationState {
    sawAssistantMessage: boolean;
    sawIdle: boolean;
    sessionErrors: string[];
    permissionRejections: string[];
}

export async function invokeEditingWorker(
    options: InvocationOptions<WorkerResult>
): Promise<WorkerResult> {
    return invokeSdkWorker(options);
}

export async function invokeReviewer(
    options: InvocationOptions<ReviewResult>
): Promise<ReviewResult> {
    return invokeSdkWorker(options);
}

export function formatRepassContext(findings: ReviewFinding[], validationSummary: string): string {
    return [
        'This is a bounded repass against the current integrated commit.',
        'Address only the findings assigned to your role. Do not broaden scope.',
        '',
        'Assigned findings:',
        JSON.stringify(findings, null, 2),
        '',
        'Validation summary:',
        validationSummary
    ].join('\n');
}

export async function invokeSdkWorker<T>(
    options: InvocationOptions<T>,
    clientFactory: SdkClientFactory = createSdkClient
): Promise<T> {
    const roleInstructions = await readFile(
        path.join(options.repoRoot, options.assignment.roleFile),
        'utf8'
    );
    const resultSchema = await readFile(options.resultSchemaPath, 'utf8');
    const agentProfile = await readFile(
        path.join(options.worktreePath, '.github', 'agents', `${options.assignment.agent}.agent.md`),
        'utf8'
    );
    const prompt = buildPrompt(options, roleInstructions, resultSchema);
    const promptPath = path.join(options.artifactDir, 'prompt.txt');
    const eventsPath = path.join(options.artifactDir, 'events.ndjson');
    const stderrPath = path.join(options.artifactDir, 'stderr.log');
    const metadataPath = path.join(options.artifactDir, 'metadata.json');
    await writeText(promptPath, prompt);
    await writeText(eventsPath, '');

    let eventWrite = Promise.resolve();
    const state: SdkInvocationState = {
        sawAssistantMessage: false,
        sawIdle: false,
        sessionErrors: [],
        permissionRejections: []
    };
    const recordEvent = (event: unknown): void => {
        eventWrite = eventWrite.then(() =>
            appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8')
        );
    };
    const onEvent = (event: SdkSessionEvent): void => {
        recordEvent(event);
        updateInvocationState(state, event);
    };
    const onPermissionDecision = (audit: PermissionAudit): void => {
        recordEvent({
            type: 'agent-loop.permission-decision',
            timestamp: new Date().toISOString(),
            data: audit
        });
        if (audit.result.kind === 'reject') {
            state.permissionRejections.push(audit.result.feedback);
        }
    };

    const client = clientFactory({
        cliPath: options.sdkRuntime.cliPath,
        workingDirectory: options.worktreePath,
        environment: buildSdkEnvironment()
    });
    let session: Awaited<ReturnType<typeof client.createSession>> | undefined;
    let invocationError: unknown;
    const cleanupErrors: Error[] = [];

    try {
        await client.start();
        session = await client.createSession(
            buildSdkSessionConfig(options, agentProfile, onEvent, onPermissionDecision)
        );
        await writeJson(metadataPath, {
            runtime: 'github-copilot-sdk',
            sdkVersion: options.sdkRuntime.sdkVersion,
            cliPath: options.sdkRuntime.cliPath,
            cliVersion: options.sdkRuntime.cliVersion,
            model: options.sdkRuntime.model,
            reasoningEffort: options.sdkRuntime.reasoningEffort ?? 'runtime-default',
            availableTools: toolsForAssignment(options.assignment),
            sessionId: session.sessionId
        });

        const response = await session.sendAndWait(
            { prompt },
            options.contract.limits.maxMinutesPerWorker * 60_000
        );
        await eventWrite;
        assertCompletedSdkInvocation(options.assignment.id, response, state);
        await writeText(stderrPath, '');
        return parseSdkStructuredResult<T>(response.data.content, options.validate);
    } catch (error) {
        invocationError = error;
        if (session) {
            await session.abort().catch(abortError => {
                cleanupErrors.push(asError('Session abort failed', abortError));
            });
        }
        await eventWrite.catch(() => undefined);
        await writeText(
            stderrPath,
            error instanceof Error ? error.stack ?? error.message : String(error)
        );
        throw error;
    } finally {
        await session?.disconnect().catch(disconnectError => {
            cleanupErrors.push(asError('Session disconnect failed', disconnectError));
        });
        try {
            cleanupErrors.push(...await client.stop());
        } catch (stopError) {
            cleanupErrors.push(asError('SDK client stop failed', stopError));
        }

        if (cleanupErrors.length > 0) {
            const cleanupMessage = cleanupErrors.map(error => error.message).join('; ');
            await appendFile(stderrPath, `\nSDK cleanup failed: ${cleanupMessage}\n`, 'utf8');
            if (invocationError === undefined) {
                throw new Error(`Copilot SDK worker cleanup failed: ${cleanupMessage}`);
            }
        }
    }
}

export function buildPrompt<T>(
    options: InvocationOptions<T>,
    roleInstructions: string,
    resultSchema: string
): string {
    const reviewedCommit = options.reviewedCommit
        ? `\nReviewed commit: ${options.reviewedCommit}`
        : '';

    return [
        `You are the ${options.assignment.role} worker for run ${options.runId}.`,
        `Base commit: ${options.baseCommit}${reviewedCommit}`,
        '',
        'ROLE INSTRUCTIONS',
        roleInstructions,
        '',
        'TASK CONTRACT',
        JSON.stringify(options.contract, null, 2),
        '',
        'RUNTIME AUTHORITY',
        JSON.stringify(options.policy, null, 2),
        '',
        'INVOCATION RULES',
        `- Work only in this isolated checkout and only within: ${options.assignment.allowedPaths.join(', ')}`,
        '- Do not use network access, live cloud resources, MCP tools, push, merge, publish, or deploy.',
        '- Do not run shell commands; the orchestrator owns Git mutations and deterministic validation.',
        '- Stop and report blocked rather than expanding authority.',
        '- Your final response must be one JSON object matching the result schema below.',
        '- Do not wrap the final JSON in Markdown or include prose outside it.',
        options.assignment.role === 'reviewer'
            ? '- Do not modify any file. Return an independent pass, changes-required, or blocked verdict.'
            : '- Set outputCommit to null; the orchestrator creates the commit after validating paths.',
        options.additionalContext ? `\nADDITIONAL CONTEXT\n${options.additionalContext}` : '',
        '',
        'RESULT SCHEMA',
        resultSchema
    ].filter(Boolean).join('\n');
}

export function buildSdkSessionConfig<T>(
    options: InvocationOptions<T>,
    agentProfile: string,
    onEvent?: (event: SdkSessionEvent) => void,
    onPermissionDecision?: (audit: PermissionAudit) => void
) {
    const tools = toolsForAssignment(options.assignment);

    return {
        sessionId: `${options.runId}-${options.assignment.id}-${Date.now()}`,
        clientName: 'sharepoint-embedded-agent-loop',
        workingDirectory: options.worktreePath,
        model: options.sdkRuntime.model,
        reasoningEffort: options.sdkRuntime.reasoningEffort,
        enableExperimentalMode: true,
        enableConfigDiscovery: false,
        availableTools: tools,
        mcpServers: {},
        customAgents: [{
            name: options.assignment.agent,
            description: `${options.assignment.role} worker for ${options.contract.taskId}`,
            prompt: agentProfile,
            tools,
            infer: false,
            model: options.sdkRuntime.model,
            reasoningEffort: options.sdkRuntime.reasoningEffort
        }],
        agent: options.assignment.agent,
        onPermissionRequest: createSdkPermissionHandler(options, onPermissionDecision),
        onEvent,
        managedSettings: {
            permissions: {
                disableBypassPermissionsMode: 'disable'
            }
        },
        enableSessionStore: false,
        memory: { enabled: false },
        infiniteSessions: { enabled: false },
        skipCustomInstructions: false,
        customAgentsLocalOnly: true,
        coauthorEnabled: false,
        manageScheduleEnabled: false,
        requestExtensions: false,
        enableSessionTelemetry: false,
        enableFileHooks: false,
        enableHostGitOperations: false,
        enableSkills: false,
        remoteSession: 'off',
        skipEmbeddingRetrieval: true,
        embeddingCacheStorage: 'in-memory',
        streaming: true,
        includeSubAgentStreamingEvents: true,
        sessionLimits: {
            maxAiCredits: options.contract.limits.maxAiCreditsPerWorker
        }
    };
}

export function createSdkPermissionHandler<T>(
    options: InvocationOptions<T>,
    onDecision?: (audit: PermissionAudit) => void
): SdkPermissionHandler {
    return request => {
        const result = decidePermission(options, request);
        onDecision?.({ requestKind: request.kind, result });
        return result;
    };
}

export function parseSdkStructuredResult<T>(
    content: string,
    validate: (value: unknown) => string[]
): T {
    const trimmed = content.trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        throw new Error(
            `SDK worker returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('SDK worker final response must be a JSON object');
    }
    const errors = validate(parsed);
    if (errors.length > 0) {
        throw new Error(`SDK worker result failed structured validation: ${errors.join('; ')}`);
    }
    return parsed as T;
}

function decidePermission<T>(
    options: InvocationOptions<T>,
    request: SdkPermissionRequest
): SdkPermissionResult {
    if (request.managedApprovalRequired) {
        return reject('Managed policy requires a human approval that is unavailable.');
    }

    if (request.kind === 'read') {
        if (request.requestSandboxBypass) {
            return reject('Read sandbox bypass is disabled for repository workers.');
        }
        const repositoryPath = resolveRequestedPath(options.worktreePath, request.path);
        if (
            repositoryPath === undefined ||
            matchesAny(options.policy.filesystem.deny, repositoryPath)
        ) {
            return reject('Read access is outside the isolated repository authority.');
        }
        return { kind: 'approve-once' };
    }

    if (request.kind === 'write') {
        if (!options.assignment.mayEdit || request.requestSandboxBypass) {
            return reject('This worker does not have permission for the requested write.');
        }
        const repositoryPath = resolveRequestedPath(options.worktreePath, request.fileName);
        if (
            repositoryPath === undefined ||
            matchesAny(options.policy.filesystem.deny, repositoryPath) ||
            !matchesAny(options.contract.allowedPaths, repositoryPath) ||
            !matchesAny(options.assignment.allowedPaths, repositoryPath)
        ) {
            return reject('Write access is outside the task and worker path authority.');
        }
        return { kind: 'approve-once' };
    }

    return reject(`Permission kind "${request.kind}" is disabled for repository workers.`);
}

function assertCompletedSdkInvocation(
    workerId: string,
    response: SdkAssistantMessage | undefined,
    state: SdkInvocationState
): asserts response is SdkAssistantMessage {
    if (state.permissionRejections.length > 0) {
        throw new Error(
            `Copilot SDK worker ${workerId} requested denied authority: ` +
            state.permissionRejections.join('; ')
        );
    }
    if (state.sessionErrors.length > 0) {
        throw new Error(
            `Copilot SDK worker ${workerId} emitted session errors: ${state.sessionErrors.join('; ')}`
        );
    }
    if (!response || !state.sawAssistantMessage || !state.sawIdle) {
        throw new Error(
            `Copilot SDK worker ${workerId} ended without complete assistant.message and session.idle evidence`
        );
    }
}

function updateInvocationState(state: SdkInvocationState, event: SdkSessionEvent): void {
    if (event.type === 'assistant.message') {
        state.sawAssistantMessage = true;
    } else if (event.type === 'session.idle') {
        state.sawIdle = true;
    } else if (event.type === 'session.error') {
        state.sessionErrors.push(readSessionError(event.data));
    }
}

function toolsForAssignment(assignment: WorkerAssignment): string[] {
    return assignment.mayEdit
        ? [...SDK_TOOLS.editing]
        : [...SDK_TOOLS.readOnly];
}

function resolveRequestedPath(
    root: string,
    requestedPath: string | undefined
): string | undefined {
    if (!requestedPath) {
        return undefined;
    }
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(root, requestedPath);
    const relative = path.relative(resolvedRoot, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return undefined;
    }
    return normalizeRepositoryPath(relative);
}

function reject(feedback: string): SdkPermissionResult {
    return { kind: 'reject', feedback };
}

function readSessionError(data: unknown): string {
    if (
        data &&
        typeof data === 'object' &&
        'message' in data &&
        typeof data.message === 'string'
    ) {
        return data.message;
    }
    return 'Unknown Copilot SDK session error';
}

function asError(prefix: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${prefix}: ${message}`);
}
