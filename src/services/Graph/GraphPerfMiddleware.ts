/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Context, Middleware } from '@microsoft/microsoft-graph-client';
import { Perf } from '../../utils/Perf';
import { templatizeGraphPath } from '../../utils/perfPathRedaction';

/**
 * Graph SDK middleware that times every request.
 *
 * Sits at the head of the middleware chain, so a span covers auth-handler work,
 * retries and redirects — i.e. the wall time the caller actually waits.
 *
 * Only the HTTP method, a templated path (identifiers replaced with placeholders) and the
 * status code are recorded; never headers, bodies, tokens or raw resource ids.
 */
export class GraphPerfMiddleware implements Middleware {
    private _next: Middleware | undefined;

    public setNext(next: Middleware): void {
        this._next = next;
    }

    public async execute(context: Context): Promise<void> {
        if (!Perf.isRecording) {
            if (this._next) { await this._next.execute(context); }
            return;
        }

        const start = Date.now();
        const label = `${GraphPerfMiddleware._method(context)} ${GraphPerfMiddleware._path(context)}`;
        try {
            if (this._next) { await this._next.execute(context); }
            Perf.record('network', label, Date.now() - start, context.response ? `HTTP ${context.response.status}` : undefined);
        } catch (error) {
            Perf.record('network', label, Date.now() - start, 'failed');
            throw error;
        }
    }

    private static _method(context: Context): string {
        // `FetchOptions` extends the DOM `RequestInit`, which isn't in this project's
        // lib set, so read the field structurally rather than through the type.
        const options = context.options as { method?: string } | undefined;
        if (options?.method) { return options.method.toUpperCase(); }
        const request = context.request as { method?: string } | string;
        if (typeof request !== 'string' && request?.method) {
            return request.method.toUpperCase();
        }
        return 'GET';
    }

    /** Path only — query string dropped and identifiers templated so no PII is logged. */
    private static _path(context: Context): string {
        const request = context.request as { url?: string } | string;
        const raw = typeof request === 'string' ? request : request?.url ?? '';
        let path: string;
        try {
            path = new URL(raw).pathname;
        } catch {
            path = raw.split('?')[0];
        }
        return templatizeGraphPath(path);
    }
}
