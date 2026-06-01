/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ARMAuthProvider, GraphAuthProvider } from '../Auth';
import { Logger } from '../../utils/Logger';

// Node 18+ (VS Code 1.94+) provides global fetch at runtime; declare a
// minimal typed shim here rather than pulling DOM types into tsconfig.
declare const fetch: (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    text(): Promise<string>;
}>;

export const ARM_BASE_URL = 'https://management.azure.com';

export interface ArmRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    apiVersion: string;
    /** Absolute path starting with '/', without host. Query string should be appended by caller or passed via `query`. */
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    /** Extra headers merged into the default set. */
    headers?: Record<string, string>;
}

export class ArmError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code: string | undefined,
        public readonly body: unknown
    ) {
        super(message);
        this.name = 'ArmError';
    }
}

function buildUrl(path: string, apiVersion: string, query?: ArmRequestOptions['query']): string {
    const url = new URL(path, ARM_BASE_URL);
    url.searchParams.set('api-version', apiVersion);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v !== undefined) {
                url.searchParams.set(k, String(v));
            }
        }
    }
    return url.toString();
}

/**
 * Acquire an ARM bearer token, preferring a silent cache hit. We pass the
 * existing Graph account so MSAL skips the account picker and goes straight
 * to silent acquisition for that identity; only the Entra consent screen
 * (first time per user+app) can still surface a prompt.
 */
async function acquireArmToken(): Promise<string> {
    const authProvider = ARMAuthProvider.getInstance();
    const graphAccount = GraphAuthProvider.getInstance().getCurrentSession()?.account;

    try {
        return await authProvider.getToken([], false, graphAccount);
    } catch {
        return await authProvider.getToken([], true, graphAccount);
    }
}

/**
 * Low-level ARM request helper. Uses ARMAuthProvider.getToken() to acquire
 * a bearer for management.azure.com/user_impersonation. Throws ArmError on
 * non-2xx responses.
 */
export async function armRequest<T = unknown>(options: ArmRequestOptions): Promise<T> {
    const method = options.method ?? 'GET';
    const token = await acquireArmToken();

    const url = buildUrl(options.path, options.apiVersion, options.query);
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.headers ?? {})
    };

    let body: string | undefined;
    if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    Logger.log(`[armRequest] ${method} ${url}`);
    const response = await fetch(url, { method, headers, body });

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!response.ok) {
        const errCode = extractErrorCode(parsed);
        const errMessage = extractErrorMessage(parsed) ?? response.statusText;
        throw new ArmError(
            `ARM request failed (${response.status} ${response.statusText}): ${errMessage}`,
            response.status,
            errCode,
            parsed
        );
    }

    return parsed as T;
}

function extractErrorCode(body: unknown): string | undefined {
    if (body && typeof body === 'object') {
        const b = body as any;
        if (b.error?.code) { return b.error.code; }
        if (b.code) { return b.code; }
    }
    return undefined;
}

function extractErrorMessage(body: unknown): string | undefined {
    if (body && typeof body === 'object') {
        const b = body as any;
        if (b.error?.message) { return b.error.message; }
        if (b.message) { return b.message; }
    }
    return undefined;
}
