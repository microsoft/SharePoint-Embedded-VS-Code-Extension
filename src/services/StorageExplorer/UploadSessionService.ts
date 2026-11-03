/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import type { NetworkRequest } from './protocol';
import { redactNetworkRequest } from './networkRedaction';
import type { StagedUploadFile } from './StagedGraphUploadService';

export const UPLOAD_CHUNK_SIZE = 18 * 320 * 1024;
const CHUNK_ALIGNMENT = 320 * 1024;

export interface UploadSessionOptions {
    /** Includes both tenant and account; checked again after token acquisition. */
    getIdentity: () => string;
    acquireToken?: (origin: string) => Promise<string>;
    onNetworkRequest?: (request: NetworkRequest) => void;
    fetch?: UploadSessionFetch;
    createStagingFile?: () => Promise<StagedUploadFile>;
}

type UploadSessionFetch = (url: string, init: {
    method: 'PUT' | 'DELETE';
    headers: Record<string, string>;
    body?: Uint8Array;
    redirect: 'error';
}) => Promise<{
    status: number;
    statusText: string;
    headers: { forEach(callback: (value: string, name: string) => void): void };
    text(): Promise<string>;
}>;

declare const fetch: UploadSessionFetch;
declare const crypto: { randomUUID(): string };

interface Session {
    url: string;
    origin: string;
    driveId: string;
    identity: string;
    preauthenticated: boolean;
    expiresAt?: number;
    total?: number;
    nextOffset: number;
    busy: boolean;
    cancelling: boolean;
}

const sessionResponse = z.object({
    uploadUrl: z.string().min(1),
    expirationDateTime: z.string().optional(),
});
const acceptedChunk = z.object({ nextExpectedRanges: z.array(z.string()).min(1) });
const completedChunk = z.object({ id: z.string().min(1) });

/** Panel-local upload capabilities. URLs and bearer tokens never cross the RPC boundary. */
export class UploadSessionService {
    private readonly _sessions = new Map<string, Session>();
    private _disposed = false;

    public constructor(private readonly _options: UploadSessionOptions = { getIdentity: () => '' }) { }

    public getIdentity(): string {
        return this._options.getIdentity();
    }

    public register(driveId: string, response: unknown, identity: string): string {
        const parsed = sessionResponse.safeParse(response);
        if (!parsed.success) { throw new Error('createUploadSession: invalid upload session response.'); }
        let url: URL;
        try {
            url = new URL(parsed.data.uploadUrl);
        } catch {
            throw new Error('createUploadSession: invalid upload session URL.');
        }
        // Only a URL returned by Graph is accepted, never a webview-provided destination.
        if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.sharepoint\.com$/.test(url.hostname)
            || url.port || url.username || url.password || url.hash) {
            throw new Error('createUploadSession: unsupported upload session destination.');
        }
        if (this._disposed || identity !== this.getIdentity()) {
            throw new Error('Upload account changed. Start the upload again.');
        }
        const expiresAt = parsed.data.expirationDateTime
            ? Date.parse(parsed.data.expirationDateTime) : undefined;
        if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
            throw new Error('Upload session expired. Retry the upload.');
        }
        for (const [id, session] of this._sessions) {
            if (session.expiresAt !== undefined && session.expiresAt <= Date.now()) {
                this._sessions.delete(id);
            }
        }
        const id = crypto.randomUUID();
        this._sessions.set(id, {
            url: parsed.data.uploadUrl,
            origin: url.origin,
            driveId,
            identity,
            preauthenticated: ['tempauth', 'access_token'].some(key => !!url.searchParams.get(key)),
            expiresAt,
            nextOffset: 0,
            busy: false,
            cancelling: false,
        });
        return id;
    }

    private _get(id: string, driveId: string, allowCancelling = false): Session {
        const session = this._sessions.get(id);
        if (!session || session.driveId !== driveId || this._disposed
            || (session.cancelling && !allowCancelling)) {
            throw new Error('Invalid upload session. Retry the upload.');
        }
        if (session.identity !== this.getIdentity()) {
            this._sessions.delete(id);
            throw new Error('Upload account changed. Start the upload again.');
        }
        if (session.expiresAt !== undefined && session.expiresAt <= Date.now()) {
            this._sessions.delete(id);
            throw new Error('Upload session expired. Retry the upload.');
        }
        return session;
    }

    private async _send(id: string, session: Session, method: 'PUT' | 'DELETE',
        headers: Record<string, string>, bytes?: Uint8Array): Promise<{ status: number; text: string }> {
        if (!session.preauthenticated) {
            if (!this._options.acquireToken) {
                throw new Error('SharePoint authentication is required for this upload session.');
            }
            headers.Authorization = `Bearer ${await this._options.acquireToken(session.origin)}`;
        }
        this._get(id, session.driveId, method === 'DELETE');
        const start = Date.now();
        const entry: NetworkRequest = {
            id: `chunk-${crypto.randomUUID()}`, method, url: session.url,
            timestamp: new Date(start).toISOString(), durationMs: 0,
            status: 0, statusText: 'Network Error', requestHeaders: headers, responseHeaders: {},
            requestBody: bytes ? `[${bytes.byteLength} bytes]` : undefined,
        };
        try {
            const response = await (this._options.fetch ?? fetch)(session.url, {
                method, headers, body: bytes, redirect: 'error',
            });
            entry.status = response.status;
            entry.statusText = response.statusText;
            response.headers.forEach((value, name) => { entry.responseHeaders[name] = value; });
            entry.responseBody = await response.text();
        } catch {
            // Fetch errors can contain the capability URL; never propagate their raw text.
            entry.error = 'Upload session request failed. Check your connection and retry.';
        }
        entry.durationMs = Date.now() - start;
        if (entry.status >= 400) {
            entry.error = `Chunk upload failed (${entry.status}): ${entry.responseBody}`;
            if (entry.status === 401) {
                entry.error += ` Session URL tempauth parameter: ${
                    new URL(session.url).searchParams.has('tempauth') ? 'present' : 'absent'
                }.`;
            }
        }
        const safe = redactNetworkRequest(entry);
        this._options.onNetworkRequest?.(safe);
        if (safe.error) { throw new Error(safe.error); }
        return { status: entry.status, text: entry.responseBody ?? '' };
    }

    public async uploadChunk(driveId: string, id: string, offset: number, total: number,
        bytes: Uint8Array): Promise<{ done: boolean; nextOffset: number; itemId?: string }> {
        const session = this._get(id, driveId);
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(total) || total <= 0
            || offset < 0 || offset % CHUNK_ALIGNMENT !== 0 || offset !== session.nextOffset
            || bytes.byteLength === 0 || bytes.byteLength > UPLOAD_CHUNK_SIZE
            || offset + bytes.byteLength > total
            || (offset + bytes.byteLength < total && bytes.byteLength % CHUNK_ALIGNMENT !== 0)
            || (session.total !== undefined && total !== session.total)) {
            throw new Error('Invalid upload chunk range or size.');
        }
        if (session.busy) { throw new Error('An upload chunk is already in progress.'); }
        session.total = total;
        session.busy = true;
        try {
            const { status, text } = await this._send(id, session, 'PUT', {
                'Content-Length': String(bytes.byteLength),
                'Content-Range': `bytes ${offset}-${offset + bytes.byteLength - 1}/${total}`,
            }, bytes);
            this._get(id, driveId);
            let body: unknown;
            try { body = JSON.parse(text); } catch { throw new Error('Invalid upload chunk response.'); }
            if (status === 200 || status === 201) {
                const result = completedChunk.safeParse(body);
                if (!result.success || offset + bytes.byteLength !== total) {
                    throw new Error('Invalid upload completion response.');
                }
                this._sessions.delete(id);
                return { done: true, nextOffset: total, itemId: result.data.id };
            }
            if (status === 202) {
                const result = acceptedChunk.safeParse(body);
                const range = result.success ? result.data.nextExpectedRanges[0] : '';
                const nextOffset = /^\d+-\d*$/.test(range) ? Number(range.split('-')[0]) : NaN;
                if (!Number.isSafeInteger(nextOffset) || nextOffset !== offset + bytes.byteLength
                    || nextOffset >= total || nextOffset % CHUNK_ALIGNMENT !== 0) {
                    throw new Error('Invalid next upload range. Retry the upload.');
                }
                session.nextOffset = nextOffset;
                return { done: false, nextOffset };
            }
            throw new Error(`Unexpected upload response (${status}).`);
        } finally {
            session.busy = false;
        }
    }

    public async cancel(driveId: string, id: string): Promise<void> {
        const session = this._get(id, driveId);
        session.cancelling = true;
        try {
            const { status } = await this._send(id, session, 'DELETE', {});
            if (status !== 204 && status !== 200) {
                throw new Error(`Upload cancellation failed (${status}).`);
            }
        } finally {
            this._sessions.delete(id);
        }
    }

    public dispose(): void {
        this._disposed = true;
        this._sessions.clear();
    }
}
