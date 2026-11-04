/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { StorageItem, UploadChunkResult } from './protocol';
import { UPLOAD_CHUNK_SIZE } from './UploadSessionService';

export const GRAPH_UPLOAD_LIMIT = 250_000_000;

export interface GraphUploadTarget {
    driveId: string;
    parentId: string | null;
    fileName: string;
    contentType: string;
    size: number;
}

export interface StagedUploadFile {
    append(bytes: Uint8Array): Promise<void>;
    upload(target: GraphUploadTarget, signal: AbortSignal): Promise<StorageItem>;
    dispose(): Promise<void>;
}

interface StagedUpload {
    target: GraphUploadTarget;
    identity: string;
    file: StagedUploadFile;
    offset: number;
    busy: boolean;
    controller: AbortController;
    pending?: Promise<UploadChunkResult>;
    cleanup?: Promise<void>;
}

declare const crypto: { randomUUID(): string };

/** Bounded local transfers followed by one Graph PUT, not a SharePoint upload session. */
export class StagedGraphUploadService {
    private readonly _uploads = new Map<string, StagedUpload>();
    private readonly _cleanups = new Set<Promise<void>>();
    private _disposed = false;
    private _creating = 0;

    public constructor(
        private readonly _identity: () => string,
        private readonly _createFile?: () => Promise<StagedUploadFile>
    ) { }

    public has(id: string): boolean { return this._uploads.has(id); }

    public async create(target: GraphUploadTarget): Promise<string> {
        if (this._disposed || !this._createFile) {
            throw new Error('Graph upload staging is unavailable. Reopen Storage Explorer.');
        }
        if (!Number.isSafeInteger(target.size) || target.size <= 0 || target.size > GRAPH_UPLOAD_LIMIT) {
            throw new Error('Single-request Graph uploads are limited to 250 MB.');
        }
        if (this._uploads.size + this._creating >= 4) {
            throw new Error('Finish or cancel an active large upload before starting another.');
        }
        const identity = this._identity();
        this._creating++;
        try {
            const file = await this._createFile();
            if (this._disposed || identity !== this._identity()) {
                await file.dispose();
                throw new Error('Upload account or panel changed. Start the upload again.');
            }
            const id = crypto.randomUUID();
            this._uploads.set(id, {
                target, identity, file, offset: 0, busy: false, controller: new AbortController(),
            });
            return id;
        } finally {
            this._creating--;
        }
    }

    private _get(id: string, driveId: string): StagedUpload {
        const upload = this._uploads.get(id);
        if (!upload || this._disposed || upload.target.driveId !== driveId || upload.controller.signal.aborted) {
            throw new Error('Invalid upload session. Retry the upload.');
        }
        return upload;
    }

    private _cleanup(id: string, upload: StagedUpload): Promise<void> {
        upload.controller.abort();
        this._uploads.delete(id);
        if (!upload.cleanup) {
            upload.cleanup = (async () => {
                // Let an active write or aborted network request release the staged file first.
                await upload.pending?.catch(() => undefined);
                await upload.file.dispose();
            })();
            const cleanup = upload.cleanup;
            this._cleanups.add(cleanup);
            const settled = (): void => { this._cleanups.delete(cleanup); };
            cleanup.then(settled, settled);
        }
        return upload.cleanup;
    }

    public async uploadChunk(driveId: string, id: string, offset: number,
        total: number, bytes: Uint8Array): Promise<UploadChunkResult> {
        const upload = this._get(id, driveId);
        if (upload.busy) { throw new Error('An upload chunk is already in progress.'); }
        upload.busy = true;
        upload.pending = (async () => {
            if (upload.identity !== this._identity()) {
                throw new Error('Upload account changed. Start the upload again.');
            }
            if (!Number.isSafeInteger(offset) || offset !== upload.offset || total !== upload.target.size
                || bytes.byteLength === 0 || bytes.byteLength > UPLOAD_CHUNK_SIZE
                || offset + bytes.byteLength > total) {
                throw new Error('Invalid upload chunk range or size.');
            }
            await upload.file.append(bytes);
            this._get(id, driveId);
            if (upload.identity !== this._identity()) {
                throw new Error('Upload account changed. Start the upload again.');
            }
            upload.offset += bytes.byteLength;
            if (upload.offset < total) {
                return { done: false, nextOffset: upload.offset };
            }
            const item = await upload.file.upload(upload.target, upload.controller.signal);
            this._get(id, driveId);
            if (upload.identity !== this._identity()) {
                throw new Error('Upload account changed. Start the upload again.');
            }
            return { done: true, nextOffset: total, item };
        })();
        let result: UploadChunkResult;
        try {
            result = await upload.pending;
        } catch (error) {
            await this._cleanup(id, upload);
            throw error;
        } finally {
            upload.busy = false;
        }
        if (result.done) {
            try {
                await this._cleanup(id, upload);
            } catch {
                throw new Error('The file was uploaded, but temporary storage cleanup failed. Do not retry the upload; refresh the folder and check local temporary storage.');
            }
        }
        return result;
    }

    public async cancel(driveId: string, id: string): Promise<void> {
        const upload = this._get(id, driveId);
        await this._cleanup(id, upload);
    }

    public async dispose(): Promise<void> {
        this._disposed = true;
        const cleanups = [...this._uploads].map(([id, upload]) => this._cleanup(id, upload));
        await Promise.all([...cleanups, ...this._cleanups]);
    }
}
