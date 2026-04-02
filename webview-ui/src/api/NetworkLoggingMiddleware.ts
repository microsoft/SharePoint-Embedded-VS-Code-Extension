import { Middleware } from '@microsoft/microsoft-graph-client';
import { NetworkRequest } from '../models/StorageItem';

export type NetworkLogger = (request: NetworkRequest) => void;

/** Convert any valid HeadersInit into a flat Record, stripping Authorization. */
function toHeaderRecord(
    headers: HeadersInit | Headers | undefined,
): Record<string, string> {
    if (!headers) return {};
    try {
        const h = headers instanceof Headers ? headers : new Headers(headers as HeadersInit);
        const record: Record<string, string> = {};
        h.forEach((value, key) => {
            if (key.toLowerCase() !== 'authorization') {
                record[key] = value;
            }
        });
        return record;
    } catch {
        return {};
    }
}

/**
 * Graph SDK Middleware that records every request/response as a NetworkRequest.
 *
 * Must be placed FIRST in the middleware chain so it wraps all other handlers
 * and measures the full round-trip duration (including auth token acquisition,
 * retries, etc.).
 *
 * Authorization headers are always stripped before logging — access tokens are
 * never captured.
 */
export class NetworkLoggingMiddleware implements Middleware {
    private _next: Middleware | undefined;

    constructor(private readonly _onRequest: NetworkLogger) {}

    public setNext(next: Middleware): void {
        this._next = next;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async execute(context: any): Promise<void> {
        const startMs = Date.now();
        const id = `${startMs}-${Math.random().toString(36).slice(2)}`;

        const url: string =
            typeof context.request === 'string'
                ? context.request
                : (context.request as Request).url;

        const method: string = (
            context.options?.method ??
            (typeof context.request !== 'string'
                ? (context.request as Request).method
                : 'GET')
        ).toUpperCase();

        // Capture request body before the chain consumes it
        let requestBody: string | undefined;
        const rawBody = context.options?.body;
        if (rawBody != null) {
            requestBody = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
        }

        let error: string | undefined;
        let responseBody: string | undefined;

        try {
            if (this._next) {
                await this._next.execute(context);
            }

            // Clone the response so the SDK's own handler can still read the body.
            const response: Response | undefined = context.response;
            if (response) {
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
            const response: Response | undefined = context.response;

            // context.options.headers is populated by AuthenticationHandler
            // (downstream) before the actual fetch.  We read it after the
            // chain executes so we capture all headers — then strip the token.
            const requestHeaders = toHeaderRecord(
                context.options?.headers as Headers | HeadersInit | undefined,
            );

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
                responseHeaders: response
                    ? toHeaderRecord(response.headers)
                    : {},
                responseBody,
                error,
            };

            // Synthesize a date header from the request start time when the
            // server's Date header isn't exposed via CORS Access-Control-Expose-Headers.
            if (response && !req.responseHeaders['date']) {
                req.responseHeaders['date'] = new Date(startMs).toUTCString();
            }

            this._onRequest(req);
        }
    }
}
