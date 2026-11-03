/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import { randomBytes } from 'crypto';
import { once } from 'events';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import type { ReadableStream } from 'stream/web';
import { setTimeout as delay } from 'timers/promises';
import { z } from 'zod';

const SESSION_LIFETIME_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 5;
const MAX_CONTENT_ATTEMPTS = 3;
const graphStatusSchema = z.object({ statusCode: z.number().int().min(100).max(599) });
const previewItemSchema = z.object({
    name: z.string().min(1),
    size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    file: z.object({ mimeType: z.enum(['application/pdf', 'video/mp4']) }),
    malware: z.unknown().optional(),
});

interface FileContentResponse {
    status: number;
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
}

export type FilePreviewKind = 'pdf' | 'mp4';

export interface FilePreviewFailure {
    statusCode?: number;
    requestId?: string;
}

interface FileSession {
    kind: FilePreviewKind;
    contentType: 'application/pdf' | 'video/mp4';
    driveId: string;
    itemId: string;
    name: string;
    size: number;
    identity: string;
    generation: number;
    expiresAt: number;
    origin: string;
    path: string;
    active: Set<AbortController>;
    authorize: () => Promise<void>;
    reportError: (failure: FilePreviewFailure) => void;
    errorReported: boolean;
}

/** Host-only, temporary PDF/MP4 streaming. No bearer token, file path, or URL crosses RPC. */
export class FilePreviewService {
    private readonly _sessions = new Set<() => void>();
    private _generation = 0;
    private _disposed = false;

    public constructor(
        private readonly _client: Graph.Client,
        private readonly _getIdentity: () => string
    ) { }

    public async open(
        driveId: string, itemId: string,
        authorize: () => Promise<void>,
        openBrowser: (url: string) => Promise<boolean>,
        reportError: (failure: FilePreviewFailure) => void,
        kind: FilePreviewKind = 'pdf'
    ): Promise<void> {
        const identity = this._getIdentity();
        const generation = this._generation;
        if (!identity || this._disposed) { throw new Error('Sign in before previewing a file.'); }
        await authorize();
        const raw: unknown = await this._client.api(`/drives/${driveId}/items/${itemId}`)
            .select('name,size,file,malware').get();
        const parsed = previewItemSchema.safeParse(raw);
        const contentType = kind === 'pdf' ? 'application/pdf' : 'video/mp4';
        if (!parsed.success || parsed.data.file.mimeType !== contentType
            || (parsed.data.malware !== undefined && parsed.data.malware !== null)) {
            throw new Error(kind === 'pdf'
                ? 'This item is not an available PDF. Use Download or a protection-aware viewer.'
                : 'This item is not an available MP4. Use Download or a protection-aware viewer.');
        }
        const session: FileSession = {
            driveId, itemId, ...parsed.data, identity, generation, kind, contentType,
            expiresAt: Date.now() + SESSION_LIFETIME_MS,
            origin: '',
            path: `/${randomBytes(32).toString('hex')}/preview.${kind}`,
            active: new Set(),
            authorize, reportError, errorReported: false,
        };
        this._assertCurrent(session);
        const server = createServer((request, response) => {
            void this._serve(request, response, session);
        });
        server.maxConnections = 8;
        server.headersTimeout = 10_000;
        server.requestTimeout = 30_000;
        server.keepAliveTimeout = 1_000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let closed = false;
        const close = (): void => {
            if (closed) { return; }
            closed = true;
            clearTimeout(timer);
            for (const controller of session.active) { controller.abort(); }
            server.close();
            server.closeAllConnections();
            this._sessions.delete(close);
        };
        try {
            await new Promise<void>((resolve, reject) => {
                const failed = (): void => reject(new Error('Could not start the local file preview.'));
                server.once('error', failed);
                server.listen(0, '127.0.0.1', () => {
                    server.removeListener('error', failed);
                    resolve();
                });
            });
            server.on('error', close);
            server.unref();
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Could not start the local file preview.');
            }
            session.origin = `http://127.0.0.1:${address.port}`;
            this._assertCurrent(session);
            if (this._sessions.size >= MAX_SESSIONS) { this._sessions.values().next().value?.(); }
            this._sessions.add(close);
            timer = setTimeout(close, SESSION_LIFETIME_MS);
            timer.unref();
            if (!await openBrowser(`${session.origin}${session.path}`)) {
                throw new Error('The browser could not open the preview. Use Download instead.');
            }
            this._assertCurrent(session);
        } catch (error) {
            close();
            throw error;
        }
    }

    private _assertCurrent(session: FileSession): void {
        if (this._disposed || session.generation !== this._generation
            || session.identity !== this._getIdentity() || Date.now() >= session.expiresAt) {
            throw new Error('The preview session expired or the account changed. Reopen the file.');
        }
    }

    private async _serve(request: IncomingMessage, response: ServerResponse, session: FileSession): Promise<void> {
        response.setHeader('Cache-Control', 'no-store, private');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        if (request.headers.host !== session.origin.slice('http://'.length) || request.url !== session.path) {
            response.writeHead(404).end();
            return;
        }
        if ((request.headers.origin && request.headers.origin !== session.origin)
            || request.headers['sec-fetch-site'] === 'cross-site') {
            response.writeHead(403).end();
            return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        const controller = new AbortController();
        const cancel = (): void => controller.abort();
        response.once('close', cancel);
        session.active.add(controller);
        let upstream: FileContentResponse | undefined;
        try {
            this._assertCurrent(session);
            await session.authorize();
            this._assertCurrent(session);
            if (controller.signal.aborted) { throw new Error('File preview cancelled.'); }
            let range: { start: number; end: number } | undefined;
            if (request.headers.range) {
                range = this._parseRange(request.headers.range, session.size);
                if (!range) {
                    response.setHeader('Content-Range', `bytes */${session.size}`);
                    response.writeHead(416).end();
                    return;
                }
            }
            response.setHeader('Content-Type', session.contentType);
            response.setHeader('Content-Disposition', `inline; filename="preview.${session.kind}"; filename*=UTF-8''${
                encodeURIComponent(session.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)
            }`);
            response.setHeader('Accept-Ranges', 'bytes');
            if (request.method === 'HEAD') {
                response.setHeader('Content-Length', session.size);
                response.writeHead(200).end();
                return;
            }
            for (let attempt = 1; attempt <= MAX_CONTENT_ATTEMPTS; attempt++) {
                if (attempt > 1) {
                    await delay(250 * (attempt - 1), undefined, { signal: controller.signal });
                    this._assertCurrent(session);
                    await session.authorize();
                    this._assertCurrent(session);
                    if (controller.signal.aborted) { throw new Error('File preview cancelled.'); }
                }
                try {
                    // Graph-only viewing beta exception; never redeem a SharePoint redirect.
                    const graphRequest = this._client.api(`/drives/${session.driveId}/items/${session.itemId}/contentStream`)
                        .version('beta')
                        .responseType(Graph.ResponseType.RAW)
                        .middlewareOptions([new Graph.RedirectHandlerOptions(0)])
                        .option('signal', controller.signal);
                    if (range) { graphRequest.header('Range', `bytes=${range.start}-${range.end}`); }
                    upstream = await graphRequest.get();
                    this._assertCurrent(session);
                    if (upstream?.status !== 403 || attempt === MAX_CONTENT_ATTEMPTS) { break; }
                    await upstream.body?.cancel();
                    upstream = undefined;
                } catch (error) {
                    const status = graphStatusSchema.safeParse(error);
                    if (!status.success || status.data.statusCode !== 403 || attempt === MAX_CONTENT_ATTEMPTS) {
                        throw error;
                    }
                }
            }
            if (!upstream?.body || (upstream.status !== 200 && upstream.status !== 206)) {
                throw new Error('Graph did not return file content.');
            }
            let length = session.size;
            if (upstream.status === 206) {
                const contentRange = `bytes ${range?.start}-${range?.end}/${session.size}`;
                if (!range || upstream.headers.get('content-range') !== contentRange) {
                    throw new Error('Graph returned an unexpected file range.');
                }
                length = range.end - range.start + 1;
                response.setHeader('Content-Range', contentRange);
            }
            const contentLength = upstream.headers.get('content-length');
            if (contentLength !== null && contentLength !== String(length)) {
                throw new Error('File size changed. Reopen the preview.');
            }
            response.setHeader('Content-Length', length);
            response.writeHead(upstream.status);
            const reader = upstream.body.getReader();
            const cancelReader = (): void => { void reader.cancel().catch(() => undefined); };
            controller.signal.addEventListener('abort', cancelReader, { once: true });
            let received = 0;
            try {
                while (true) {
                    this._assertCurrent(session);
                    if (controller.signal.aborted) { throw new Error('File preview cancelled.'); }
                    const chunk = await reader.read();
                    this._assertCurrent(session);
                    if (controller.signal.aborted) { throw new Error('File preview cancelled.'); }
                    if (chunk.done) { break; }
                    received += chunk.value.byteLength;
                    if (received > length) { throw new Error('File size changed.'); }
                    if (!response.write(chunk.value)) {
                        await once(response, 'drain', { signal: controller.signal });
                    }
                }
                if (received !== length) { throw new Error('The file stream was incomplete.'); }
                response.end();
            } finally {
                controller.signal.removeEventListener('abort', cancelReader);
                await reader.cancel().catch(() => undefined);
                reader.releaseLock();
            }
        } catch (error) {
            // Report only status and a validated request ID, never Graph bodies or capability URLs.
            if (!controller.signal.aborted && !session.errorReported) {
                session.errorReported = true;
                const status = graphStatusSchema.safeParse(error);
                const graphError = error instanceof Graph.GraphError ? error : undefined;
                const headers: unknown = graphError?.headers ?? upstream?.headers;
                const headerRequestId: unknown = headers !== null && typeof headers === 'object'
                    && 'get' in headers && typeof headers.get === 'function'
                    ? headers.get('request-id') : undefined;
                const requestId = z.string().uuid().safeParse(graphError?.requestId ?? headerRequestId);
                session.reportError({
                    statusCode: status.success ? status.data.statusCode : upstream?.status,
                    requestId: requestId.success ? requestId.data : undefined,
                });
            }
            if (response.headersSent) { response.destroy(); }
            else {
                response.removeHeader('Content-Disposition');
                response.removeHeader('Content-Range');
                response.removeHeader('Content-Type');
                response.writeHead(502).end();
            }
        } finally {
            controller.abort();
            if (upstream?.body && !upstream.body.locked) {
                await upstream.body.cancel().catch(() => undefined);
            }
            response.removeListener('close', cancel);
            session.active.delete(controller);
        }
    }

    private _parseRange(header: string, size: number): { start: number; end: number } | undefined {
        const match = /^bytes=(\d*)-(\d*)$/.exec(header);
        if (!match || (!match[1] && !match[2])) { return undefined; }
        if (match.slice(1).some(value => value && !Number.isSafeInteger(Number(value)))) { return undefined; }
        const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
            || start < 0 || start > end || start >= size || (!match[1] && Number(match[2]) === 0)) {
            return undefined;
        }
        return { start, end };
    }

    public closeAll(): void {
        this._generation++;
        for (const close of this._sessions) { close(); }
    }

    public dispose(): void {
        this._disposed = true;
        this.closeAll();
    }
}
