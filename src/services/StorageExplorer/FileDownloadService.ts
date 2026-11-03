/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { UploadSessionOptions } from './UploadSessionService';

export type DownloadSource = (signal: AbortSignal) => AsyncIterable<Uint8Array>;
export type SaveDownload = (name: string, source: DownloadSource) => Promise<void>;

export interface DownloadResponse {
    status: number;
    body: {
        getReader(): {
            read(): Promise<{ done: boolean; value?: Uint8Array }>;
            cancel(): Promise<void>;
            releaseLock(): void;
        };
        cancel(): Promise<void>;
    } | null;
}

/** Streams Graph content only; credentials and content stay on the host. */
export class FileDownloadService {
    private readonly _active = new Set<AbortController>();
    private _disposed = false;

    public constructor(
        private readonly _options: Pick<UploadSessionOptions, 'getIdentity'> = {
            getIdentity: () => '',
        }
    ) { }

    public getIdentity(): string {
        return this._options.getIdentity();
    }

    private _assertIdentity(identity: string, signal: AbortSignal): void {
        if (this._disposed || signal.aborted || identity !== this.getIdentity()) {
            throw new Error('Download cancelled or account changed. Retry the download.');
        }
    }

    public async *readGraph(
        open: (signal: AbortSignal) => Promise<DownloadResponse>,
        size: number, identity: string, signal: AbortSignal
    ): AsyncIterable<Uint8Array> {
        this._assertIdentity(identity, signal);
        const controller = new AbortController();
        const cancel = (): void => controller.abort();
        signal.addEventListener('abort', cancel, { once: true });
        this._active.add(controller);
        try {
            const response = await open(controller.signal);
            yield* this._readResponse(response, size, identity, signal);
        } finally {
            controller.abort();
            this._active.delete(controller);
            signal.removeEventListener('abort', cancel);
        }
    }

    private async *_readResponse(
        response: DownloadResponse, size: number, identity: string, signal: AbortSignal
    ): AsyncIterable<Uint8Array> {
        if (response.status !== 200 || !response.body) {
            await response.body?.cancel();
            if (response.status >= 300 && response.status < 400) {
                throw new Error('Microsoft Graph returned a redirect instead of file content. Direct contentStream support is required; SharePoint authentication is not used for downloads.');
            }
            throw Object.assign(new Error(`File download failed (HTTP ${response.status}).`), {
                statusCode: response.status,
                code: response.status === 403 ? 'accessDenied'
                    : response.status === 401 ? 'unauthenticated' : 'downloadFailed',
            });
        }
        const reader = response.body.getReader();
        let received = 0;
        let complete = false;
        try {
            while (true) {
                this._assertIdentity(identity, signal);
                let chunk: { done: boolean; value?: Uint8Array };
                try {
                    chunk = await reader.read();
                } catch {
                    throw new Error('The file download was interrupted. Retry the download.');
                }
                this._assertIdentity(identity, signal);
                if (chunk.done) { complete = true; break; }
                if (!chunk.value) { throw new Error('Invalid file download response.'); }
                received += chunk.value.byteLength;
                if (received > size) { throw new Error('Downloaded file size does not match the item. Retry the download.'); }
                yield chunk.value;
            }
            if (received !== size) {
                throw new Error('The downloaded file is incomplete. Retry the download.');
            }
        } finally {
            try {
                if (!complete) { await reader.cancel(); }
            } catch {
                throw new Error('The file download was interrupted. Retry the download.');
            } finally {
                reader.releaseLock();
            }
        }
    }

    public dispose(): void {
        this._disposed = true;
        for (const controller of this._active) { controller.abort(); }
    }
}
