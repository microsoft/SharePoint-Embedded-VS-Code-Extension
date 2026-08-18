import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { resolveInside } from './paths';
import { WorkerAssignment } from './types';

export interface AgentProfile {
    name: string;
    description: string;
    target: string;
    tools: string[];
    disableModelInvocation: boolean;
    userInvocable: boolean;
    path: string;
}

export function validateAgentProfile(repoRoot: string, worker: WorkerAssignment): AgentProfile {
    const profilePath = resolveInside(
        repoRoot,
        path.posix.join('.github', 'agents', `${worker.agent}.agent.md`)
    );
    const profile = parseAgentProfile(profilePath);
    const expectedTools = worker.mayEdit
        ? ['edit', 'read', 'search']
        : ['read', 'search'];
    const actualTools = [...profile.tools].sort();

    if (profile.name !== worker.agent) {
        throw new Error(
            `Agent profile ${profilePath} declares "${profile.name}" instead of "${worker.agent}"`
        );
    }
    if (profile.target !== 'github-copilot') {
        throw new Error(`Agent ${worker.agent} must target github-copilot`);
    }
    if (profile.userInvocable || !profile.disableModelInvocation) {
        throw new Error(`Agent ${worker.agent} must be programmatic-only`);
    }
    if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
        throw new Error(
            `Agent ${worker.agent} tools must be exactly ${expectedTools.join(', ')}; found ${actualTools.join(', ')}`
        );
    }

    return profile;
}

export function agentProfileRepositoryPath(agentName: string): string {
    return path.posix.join('.github', 'agents', `${agentName}.agent.md`);
}

function parseAgentProfile(profilePath: string): AgentProfile {
    let content: string;
    try {
        content = readFileSync(profilePath, 'utf8');
    } catch (error) {
        throw new Error(`Unable to read agent profile ${profilePath}: ${errorMessage(error)}`);
    }

    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    if (!frontmatter) {
        throw new Error(`Agent profile is missing YAML frontmatter: ${profilePath}`);
    }

    const values = new Map<string, string>();
    for (const line of frontmatter[1].split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }
        const separator = line.indexOf(':');
        if (separator <= 0) {
            throw new Error(`Unsupported agent frontmatter line in ${profilePath}: ${line}`);
        }
        values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }

    if (values.has('mcp-servers')) {
        throw new Error(`Agent profile must not configure MCP servers: ${profilePath}`);
    }

    return {
        name: requiredScalar(values, 'name', profilePath),
        description: requiredScalar(values, 'description', profilePath),
        target: requiredScalar(values, 'target', profilePath),
        tools: parseTools(values, profilePath),
        disableModelInvocation: parseBoolean(values, 'disable-model-invocation', profilePath),
        userInvocable: parseBoolean(values, 'user-invocable', profilePath),
        path: profilePath
    };
}

function parseTools(values: Map<string, string>, profilePath: string): string[] {
    const raw = requiredScalar(values, 'tools', profilePath);
    try {
        const tools = JSON.parse(raw) as unknown;
        if (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string')) {
            throw new Error('tools must be a string array');
        }
        return tools.map(tool => tool.toLowerCase());
    } catch (error) {
        throw new Error(`Invalid tools list in ${profilePath}: ${errorMessage(error)}`);
    }
}

function requiredScalar(values: Map<string, string>, key: string, profilePath: string): string {
    const value = values.get(key);
    if (!value) {
        throw new Error(`Agent profile ${profilePath} is missing ${key}`);
    }
    return unquote(value);
}

function parseBoolean(values: Map<string, string>, key: string, profilePath: string): boolean {
    const value = requiredScalar(values, key, profilePath);
    if (value !== 'true' && value !== 'false') {
        throw new Error(`Agent profile ${profilePath} has invalid boolean ${key}`);
    }
    return value === 'true';
}

function unquote(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith('\'') && value.endsWith('\''))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
