import { access, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { validateAgentProfile } from './agentProfiles';
import { runProcess } from './process';
import { TaskContract, WorkerAssignment } from './types';

const REQUIRED_READ_TOOLS = ['view', 'grep', 'glob'];
const REQUIRED_EDIT_TOOLS = [...REQUIRED_READ_TOOLS, 'create', 'edit'];
export type SdkReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface SdkAssistantMessage {
    type: 'assistant.message';
    data: {
        content: string;
    };
}

export interface SdkSessionEvent {
    type: string;
    data?: unknown;
    [key: string]: unknown;
}

export interface SdkAuthStatus {
    isAuthenticated: boolean;
    statusMessage?: string;
}

export interface SdkModelInfo {
    id: string;
    policy?: {
        state: 'enabled' | 'disabled' | 'unconfigured';
    };
    supportedReasoningEfforts?: SdkReasoningEffort[];
}

interface SdkModule {
    CopilotClient: new (options: Record<string, unknown>) => SdkClientLike;
    RuntimeConnection: {
        forStdio(options: { path: string }): unknown;
    };
}

// The SDK publishes a CommonJS entrypoint. Requiring it here makes SDK availability
// unconditional for the runner without converting the extension repository to ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CopilotClient, RuntimeConnection } = require('@github/copilot-sdk') as SdkModule;

const VALID_REASONING_EFFORTS = new Set<SdkReasoningEffort>([
    'low',
    'medium',
    'high',
    'xhigh',
    'max'
]);

export interface SdkSessionLike {
    readonly sessionId: string;
    sendAndWait(
        options: { prompt: string },
        timeout?: number
    ): Promise<SdkAssistantMessage | undefined>;
    abort(): Promise<void>;
    disconnect(): Promise<void>;
}

export interface SdkClientLike {
    readonly rpc: {
        tools: {
            list(params: { model?: string }): Promise<{ tools: Array<{ name: string }> }>;
        };
    };
    start(): Promise<void>;
    stop(): Promise<Error[]>;
    getAuthStatus(): Promise<SdkAuthStatus>;
    getStatus(): Promise<{ version: string }>;
    listModels(): Promise<SdkModelInfo[]>;
    createSession(config: unknown): Promise<SdkSessionLike>;
}

export interface SdkClientFactoryOptions {
    cliPath: string;
    workingDirectory: string;
    environment: Record<string, string | undefined>;
}

export type SdkClientFactory = (options: SdkClientFactoryOptions) => SdkClientLike;

export interface SdkPreflightResult {
    sdkVersion: string;
    cliPath: string;
    cliVersion: string;
    model: string;
    reasoningEffort?: SdkReasoningEffort;
    availableTools: string[];
}

interface SdkPreflightOptions {
    repoRoot: string;
    contract: TaskContract;
    workers: WorkerAssignment[];
    environment?: NodeJS.ProcessEnv;
    clientFactory?: SdkClientFactory;
}

export function createSdkClient(options: SdkClientFactoryOptions): SdkClientLike {
    const clientOptions: Record<string, unknown> = {
        mode: 'copilot-cli',
        connection: RuntimeConnection.forStdio({
            path: options.cliPath
        }),
        workingDirectory: options.workingDirectory,
        env: options.environment,
        logLevel: 'warning'
    };
    return new CopilotClient(clientOptions);
}

export async function runSdkPreflight(options: SdkPreflightOptions): Promise<SdkPreflightResult> {
    for (const worker of options.workers) {
        validateAgentProfile(options.repoRoot, worker);
    }

    const environment = options.environment ?? process.env;
    const cliPath = await resolveSdkCliPath(
        environment.AGENT_LOOP_COPILOT_COMMAND ?? 'copilot',
        options.repoRoot
    );
    const sdkVersion = await readSdkVersion(options.repoRoot);
    const clientFactory = options.clientFactory ?? createSdkClient;
    const client = clientFactory({
        cliPath,
        workingDirectory: options.repoRoot,
        environment: buildSdkEnvironment(environment)
    });

    let result: SdkPreflightResult | undefined;
    let preflightError: unknown;
    try {
        await client.start();
        const auth = await client.getAuthStatus();
        if (!auth.isAuthenticated) {
            throw new Error(
                `Copilot SDK authentication is unavailable${auth.statusMessage ? `: ${auth.statusMessage}` : ''}`
            );
        }

        const models = await client.listModels();
        const model = resolveModel(environment.AGENT_LOOP_MODEL, models);
        const reasoningEffort = resolveReasoningEffort(
            environment.AGENT_LOOP_REASONING_EFFORT,
            model,
            models
        );
        const availableTools = (await client.rpc.tools.list({ model })).tools.map(tool => tool.name);
        assertRequiredTools(options.workers, availableTools);
        const status = await client.getStatus();

        result = {
            sdkVersion,
            cliPath,
            cliVersion: status.version,
            model,
            reasoningEffort,
            availableTools
        };
    } catch (error) {
        preflightError = error;
    }

    const cleanupErrors: Error[] = [];
    try {
        cleanupErrors.push(...await client.stop());
    } catch (error) {
        cleanupErrors.push(
            new Error(
                `SDK client stop failed: ${error instanceof Error ? error.message : String(error)}`
            )
        );
    }
    if (preflightError !== undefined || cleanupErrors.length > 0) {
        const messages = [
            preflightError instanceof Error ? preflightError.message : (
                preflightError === undefined ? '' : String(preflightError)
            ),
            ...cleanupErrors.map(error => error.message)
        ].filter(Boolean);
        throw new Error(`Copilot SDK preflight failed: ${messages.join('; ')}`);
    }
    return result!;
}

export async function resolveSdkCliPath(command: string, cwd: string): Promise<string> {
    let resolved: string | undefined;
    if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) {
        resolved = path.resolve(cwd, command);
    } else {
        const locator = process.platform === 'win32' ? 'where.exe' : 'which';
        const lookup = process.platform === 'win32' && path.extname(command) === ''
            ? `${command}.exe`
            : command;
        const result = await runProcess(locator, [lookup], {
            cwd,
            timeoutMs: 10_000,
            env: buildSdkEnvironment()
        });
        resolved = result.stdout
            .split(/\r?\n/)
            .map(value => value.trim())
            .find(Boolean);
        if (result.exitCode !== 0) {
            resolved = undefined;
        }
    }

    if (!resolved || !path.isAbsolute(resolved)) {
        throw sdkExecutableError(command);
    }
    if (process.platform === 'win32' && path.extname(resolved).toLowerCase() !== '.exe') {
        throw sdkExecutableError(command);
    }
    try {
        await access(resolved);
    } catch {
        throw sdkExecutableError(command);
    }
    return resolved;
}

export function buildSdkEnvironment(
    environment: NodeJS.ProcessEnv = process.env
): Record<string, string | undefined> {
    const filtered = { ...environment };
    for (const name of Object.keys(filtered)) {
        if (
            isSecretEnvironmentVariable(name) &&
            !['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].includes(name.toUpperCase())
        ) {
            delete filtered[name];
        }
    }
    return filtered;
}

export function resolveModel(requested: string | undefined, models: SdkModelInfo[]): string {
    const model = requested?.trim() || 'auto';
    const match = models.find(candidate => candidate.id === model);
    if (!match) {
        throw new Error(`Copilot SDK model "${model}" is not available`);
    }
    if (match.policy?.state === 'disabled') {
        throw new Error(`Copilot SDK model "${model}" is disabled by policy`);
    }
    return model;
}

export function resolveReasoningEffort(
    requested: string | undefined,
    modelId: string,
    models: SdkModelInfo[]
): SdkReasoningEffort | undefined {
    const configured = requested?.trim().toLowerCase();
    if (modelId === 'auto') {
        if (configured) {
            throw new Error('Copilot SDK model "auto" does not support an explicit reasoning effort');
        }
        return undefined;
    }

    const model = models.find(candidate => candidate.id === modelId);
    if (!model?.supportedReasoningEfforts) {
        if (configured) {
            throw new Error(
                `Copilot SDK model "${modelId}" does not support reasoning effort configuration`
            );
        }
        return undefined;
    }

    const normalized = (configured || 'high') as SdkReasoningEffort;
    if (!VALID_REASONING_EFFORTS.has(normalized)) {
        throw new Error(
            `Unsupported AGENT_LOOP_REASONING_EFFORT "${requested}"; expected low, medium, high, xhigh, or max`
        );
    }

    if (!model.supportedReasoningEfforts.includes(normalized)) {
        throw new Error(
            `Copilot SDK model "${modelId}" does not support reasoning effort "${normalized}"`
        );
    }
    return normalized;
}

function assertRequiredTools(workers: WorkerAssignment[], availableTools: string[]): void {
    const required = workers.some(worker => worker.mayEdit)
        ? REQUIRED_EDIT_TOOLS
        : REQUIRED_READ_TOOLS;
    const available = new Set(availableTools);
    const missing = required.filter(tool => !available.has(tool));
    if (missing.length > 0) {
        throw new Error(`Copilot SDK runtime is missing required built-in tools: ${missing.join(', ')}`);
    }
}

async function readSdkVersion(repoRoot: string): Promise<string> {
    const packagePath = path.join(
        repoRoot,
        'node_modules',
        '@github',
        'copilot-sdk',
        'package.json'
    );
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(packagePath, 'utf8'));
    } catch (error) {
        throw new Error(
            `Unable to load @github/copilot-sdk package metadata: ${error instanceof Error ? error.message : String(error)}`
        );
    }
    if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('version' in parsed) ||
        typeof parsed.version !== 'string'
    ) {
        throw new Error('Unable to determine @github/copilot-sdk package version');
    }
    return parsed.version;
}

function sdkExecutableError(command: string): Error {
    const requirement = process.platform === 'win32'
        ? ' SDK-only mode on Windows requires a native copilot.exe; PowerShell and batch shims cannot host the JSON-RPC server.'
        : '';
    return new Error(`Unable to resolve Copilot executable "${command}".${requirement}`);
}

function isSecretEnvironmentVariable(name: string): boolean {
    return /(TOKEN|SECRET|PASSWORD|CREDENTIAL|CONNECTION_STRING|PRIVATE_KEY)/i.test(name);
}
