/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Client } from '@microsoft/microsoft-graph-client';
import type { DriveItem } from '@microsoft/microsoft-graph-types';
import type { Blob } from 'buffer';
import { openAsBlob } from 'fs';
import { mkdtemp, open, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { driveItemToStorageItem } from './mappers';
import type { StagedUploadFile } from './StagedGraphUploadService';

// Available in VS Code's Node runtime; the repository's older Node typings omit this API.
declare module 'fs' {
    function openAsBlob(path: string, options?: { type?: string }): Promise<Blob>;
}

/** Host-only staging: no webview-provided path, and no whole-file buffer or token on disk. */
export async function createTemporaryGraphUpload(client: Client): Promise<StagedUploadFile> {
    let directory: string;
    try {
        directory = await mkdtemp(join(tmpdir(), 'spe-graph-upload-'));
    } catch {
        throw new Error('Could not create temporary upload storage. Check available disk space.');
    }
    const path = join(directory, 'content');
    let file;
    try {
        file = await open(path, 'wx', 0o600);
    } catch {
        await rm(directory, { recursive: true, force: true });
        throw new Error('Could not create temporary upload storage. Check available disk space.');
    }
    const handle = file;
    let closed = false;
    async function close(): Promise<void> {
        if (!closed) {
            await handle.close();
            closed = true;
        }
    }
    return {
        append: async bytes => {
            try {
                let offset = 0;
                while (offset < bytes.byteLength) {
                    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset);
                    if (bytesWritten === 0) { throw new Error('No bytes written'); }
                    offset += bytesWritten;
                }
            } catch {
                throw new Error('Could not stage the upload. Check available disk space and retry.');
            }
        },
        upload: async (target, signal) => {
            let body: Blob;
            try {
                await close();
                body = await openAsBlob(path, { type: target.contentType });
            } catch {
                throw new Error('Could not read the staged upload. Retry the upload.');
            }
            if (body.size !== target.size) { throw new Error('Staged upload size does not match the file.'); }
            const endpoint = target.parentId
                ? `/drives/${target.driveId}/items/${target.parentId}:/${encodeURIComponent(target.fileName)}:/content`
                : `/drives/${target.driveId}/root:/${encodeURIComponent(target.fileName)}:/content`;
            const created: DriveItem = await client.api(endpoint)
                .header('Content-Type', target.contentType)
                .query({ '@microsoft.graph.conflictBehavior': 'rename' })
                .option('signal', signal)
                .put(body);
            if (!created?.id) { throw new Error('Graph returned an invalid upload result.'); }
            return driveItemToStorageItem(created);
        },
        dispose: async () => {
            try {
                await close();
                await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            } catch {
                throw new Error('Could not remove temporary upload storage. Close Storage Explorer and retry cleanup.');
            }
        },
    };
}
