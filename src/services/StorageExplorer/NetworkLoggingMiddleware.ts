/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import { NetworkRequest } from './protocol';
import { redactNetworkRequest } from './networkRedaction';

export type NetworkLogger = (request: NetworkRequest) => void;

/**
 * Flatten any header container (fetch `Headers`, plain object, or array of pairs)
 * into a record, always stripping `Authorization`.
 *
 * Deliberately duck-typed rather than using the DOM `Headers` type: the extension
 * host compiles against `lib: ES6` and has no DOM typings.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHeaderRecord(headers: any): Record<string, string> {
    const record: Record<string, string> = {};
    if (!headers) { return record; }

    const put = (key: unknown, value: unknown): void => {
        const name = String(key);
        if (name.toLowerCase() !== 'authorization') {
            record[name] = String(value);
        }
    };

    try {
        if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
            // fetch Headers: forEach yields (value, key)
            headers.forEach((value: unknown, key: unknown) => put(key, value));
        } else if (Array.isArray(headers)) {
            for (const pair of headers) {
                if (Array.isArray(pair) && pair.length >= 2) { put(pair[0], pair[1]); }
            }
        } else if (typeof headers === 'object') {
            for (const key of Object.keys(headers)) { put(key, headers[key]); }
        }
    } catch {
        return {};
    }
    return record;
}

/**
 * Graph SDK middleware that records every request/response as a `NetworkRequest`.
 *
 * Must be placed FIRST in the middleware chain so it wraps all other handlers
 * and measures the full round-trip duration (including auth token acquisition,
 * retries, etc.).
 *
 * Every entry is passed through `redactNetworkRequest` before it leaves this class, so
 * access tokens, pre-authenticated capability URLs, and directory PII never reach the
 * network drawer, the webview, or a HAR export.
 */
export class NetworkLoggingMiddleware implements Graph.Middleware {
    private _next: Graph.Middleware | undefined;

    public constructor(private readonly _onRequest: NetworkLogger) { }

    public setNext(next: Graph.Middleware): void {
        this._next = next;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async execute(context: any): Promise<void> {
        const startMs = Date.now();
        const id = `${startMs}-${Math.random().toString(36).slice(2)}`;

        const url: string =
            typeof context.request === 'string' ? context.request : context.request?.url ?? '';

        const method: string = String(
            context.options?.method ??
            (typeof context.request !== 'string' ? context.request?.method : 'GET') ??
            'GET'
        ).toUpperCase();

        // Capture the request body before the chain consumes it.
        let requestBody: string | undefined;
        const rawBody = context.options?.body;
        if (rawBody !== null && rawBody !== undefined) {
            if (typeof rawBody === 'string') {
                requestBody = rawBody;
            } else if (typeof rawBody.byteLength === 'number') {
                // Binary upload payload — record its size instead of its contents.
                requestBody = `[${rawBody.byteLength} bytes]`;
            } else {
                try {
                    requestBody = JSON.stringify(rawBody);
                } catch {
                    requestBody = '[unserializable body]';
                }
            }
        }

        let error: string | undefined;
        let responseBody: string | undefined;

        try {
            if (this._next) {
                await this._next.execute(context);
            }

            // Clone the response so the SDK's own handler can still read the body.
            const response = context.response;
            if (response && typeof response.clone === 'function') {
                try {
                    responseBody = await response.clone().text();
                } catch {
                    // Body not readable (e.g. 204 No Content) — leave undefined
                }
            }
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            const durationMs = Date.now() - startMs;
            const response = context.response;

            // context.options.headers is populated by AuthenticationHandler
            // (downstream) before the actual fetch. We read it after the chain
            // executes so we capture all headers — then strip the token.
            const requestHeaders = toHeaderRecord(context.options?.headers);

            const req: NetworkRequest = {
                id,
                method,
                url,
                status: response?.status ?? 0,
                statusText: response?.statusText ?? (error ? 'Error' : 'Unknown'),
                durationMs,
                timestamp: new Date(startMs).toISOString(),
                requestHeaders,
                requestBody,
                responseHeaders: response ? toHeaderRecord(response.headers) : {},
                responseBody,
                error,
            };

            // Synthesize a date header from the request start time when the server's
            // Date header isn't present.
            if (response && !req.responseHeaders['date']) {
                req.responseHeaders['date'] = new Date(startMs).toUTCString();
            }

            // Redact at the point of capture: nothing bearer-equivalent should exist in
            // any downstream consumer's state, not even briefly.
            this._onRequest(redactNetworkRequest(req));
        }
    }
}
