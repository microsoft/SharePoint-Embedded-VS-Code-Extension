import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { writeText } from './evidence';
import { outputTail, runProcess } from './process';
import {
    AuthorityPolicy,
    ReviewFinding,
    ReviewResult,
    TaskContract,
    WorkerAssignment,
    WorkerResult
} from './types';

interface InvocationOptions<T> {
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
    additionalContext?: string;
}

export async function invokeEditingWorker(
    options: InvocationOptions<WorkerResult>
): Promise<WorkerResult> {
    return invoke<WorkerResult>(options);
}

export async function invokeReviewer(
    options: InvocationOptions<ReviewResult>
): Promise<ReviewResult> {
    return invoke<ReviewResult>(options);
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

async function invoke<T>(options: InvocationOptions<T>): Promise<T> {
    const roleInstructions = await readFile(
        path.join(options.repoRoot, options.assignment.roleFile),
        'utf8'
    );
    const resultSchema = await readFile(options.resultSchemaPath, 'utf8');
    const prompt = buildPrompt(options, roleInstructions, resultSchema);
    const promptPath = path.join(options.artifactDir, 'prompt.txt');
    const eventsPath = path.join(options.artifactDir, 'events.ndjson');
    const stderrPath = path.join(options.artifactDir, 'stderr.log');
    await writeText(promptPath, prompt);

    const executable = process.env.AGENT_LOOP_COPILOT_COMMAND ?? 'copilot';
    const discoveredMcpServers = await discoverMcpServerNames(executable, options.worktreePath);
    const args = buildCopilotArguments(options, prompt, discoveredMcpServers);
    const result = await runProcess(executable, args, {
        cwd: options.worktreePath,
        timeoutMs: options.contract.limits.maxMinutesPerWorker * 60_000,
        stdoutPath: eventsPath,
        stderrPath,
        env: buildCopilotEnvironment()
    });

    if (result.timedOut) {
        throw new Error(`Copilot worker ${options.assignment.id} exceeded its time budget`);
    }
    if (result.exitCode !== 0) {
        throw new Error(
            `Copilot worker ${options.assignment.id} failed with exit code ${result.exitCode}: ` +
            outputTail(result.stderr)
        );
    }

    return extractStructuredResult<T>(result.stdout, options.validate);
}

export function buildCopilotEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
    const result = { ...environment };
    if (platform !== 'win32') {
        return result;
    }

    for (const key of Object.keys(result).filter(name => name.toLowerCase() === 'path')) {
        result[key] = result[key]
            ?.split(path.delimiter)
            .filter(entry => !isIncompatibleWindowsSandboxPath(entry))
            .join(path.delimiter);
    }

    return result;
}

function isIncompatibleWindowsSandboxPath(value: string): boolean {
    const normalized = value.trim().replace(/[\\/]+$/, '').toLowerCase();
    return normalized === 'c:\\programdata\\chocolatey\\bin';
}

function buildPrompt<T>(
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

export function buildCopilotArguments<T>(
    options: InvocationOptions<T>,
    prompt: string,
    discoveredMcpServers: string[] = []
): string[] {
    const args = [
        '--prompt',
        prompt,
        '--output-format',
        'json',
        '--stream',
        'off',
        '--mode',
        'autopilot',
        '--experimental',
        '--sandbox',
        '--max-autopilot-continues',
        String(options.contract.limits.maxAutopilotContinues),
        '--max-ai-credits',
        String(options.contract.limits.maxAiCreditsPerWorker),
        '--reasoning-effort',
        process.env.AGENT_LOOP_REASONING_EFFORT ?? 'high',
        '--agent',
        options.assignment.agent,
        '--session-id',
        randomUUID(),
        '--name',
        `${options.contract.taskId}-${options.assignment.id}`,
        '--log-dir',
        path.join(options.artifactDir, 'copilot-logs'),
        '--no-ask-user',
        '--no-auto-update',
        '--no-color',
        '--no-remote',
        '--no-remote-export',
        '--disable-builtin-mcps',
        '--disallow-temp-dir',
        '--deny-tool=url',
        '--deny-tool=shell',
        '--deny-tool=write(node_modules)',
        '--deny-tool=write(.env)',
        '--deny-tool=shell(git push)',
        '--deny-tool=shell(git merge)',
        '--deny-tool=shell(gh pr merge)',
        '--deny-tool=shell(npm publish)',
        '--deny-tool=shell(npx vsce publish)'
    ];

    const disabledMcpServers = new Set([
        ...options.policy.mcp.disabledServers,
        ...discoveredMcpServers
    ]);
    for (const serverName of disabledMcpServers) {
        args.push('--disable-mcp-server', serverName);
    }

    if (process.env.AGENT_LOOP_MODEL) {
        args.push('--model', process.env.AGENT_LOOP_MODEL);
    }

    if (options.assignment.mayEdit) {
        args.push('--allow-tool=write');
    } else {
        args.push('--deny-tool=write');
    }

    const secretEnvironmentVariables = Object.keys(process.env).filter(isSecretEnvironmentVariable);
    if (secretEnvironmentVariables.length > 0) {
        args.push(`--secret-env-vars=${secretEnvironmentVariables.join(',')}`);
    }

    return args;
}

async function discoverMcpServerNames(executable: string, cwd: string): Promise<string[]> {
    try {
        const result = await runProcess(executable, ['mcp', 'list', '--json'], {
            cwd,
            timeoutMs: 30_000
        });
        if (result.exitCode !== 0) {
            return [];
        }

        const parsed = JSON.parse(result.stdout) as unknown;
        const names = new Set<string>();
        collectNamedServers(parsed, names);
        return [...names];
    } catch {
        return [];
    }
}

function collectNamedServers(value: unknown, names: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectNamedServers(item, names);
        }
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string' && record.name.length > 0) {
        names.add(record.name);
    }
    for (const nested of Object.values(record)) {
        collectNamedServers(nested, names);
    }
}

function isSecretEnvironmentVariable(name: string): boolean {
    return /(TOKEN|SECRET|PASSWORD|CREDENTIAL|CONNECTION_STRING|PRIVATE_KEY)/i.test(name);
}

function extractStructuredResult<T>(
    jsonLines: string,
    validate: (value: unknown) => string[]
): T {
    const candidates: string[] = [];

    for (const line of jsonLines.split(/\r?\n/).filter(Boolean)) {
        try {
            collectStrings(JSON.parse(line), candidates);
        } catch {
            candidates.push(line);
        }
    }

    const validationFailures: string[] = [];
    for (const candidate of candidates.reverse()) {
        const parsed = parseJsonObject(candidate);
        if (parsed === undefined) {
            continue;
        }

        const errors = validate(parsed);
        if (errors.length === 0) {
            return parsed as T;
        }
        validationFailures.push(...errors);
    }

    throw new Error(
        'Worker did not return a valid structured result' +
        (validationFailures.length > 0 ? `: ${validationFailures.slice(0, 10).join('; ')}` : '')
    );
}

function collectStrings(value: unknown, target: string[]): void {
    if (typeof value === 'string') {
        target.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectStrings(item, target);
        }
        return;
    }
    if (value && typeof value === 'object') {
        for (const nested of Object.values(value)) {
            collectStrings(nested, target);
        }
    }
}

function parseJsonObject(value: string): unknown | undefined {
    const trimmed = value
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace <= firstBrace) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
        return undefined;
    }
}
