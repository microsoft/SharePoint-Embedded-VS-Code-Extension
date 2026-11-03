/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { rename, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import type { DownloadSource } from './FileDownloadService';

/** The destination comes exclusively from the native Save As dialog, never the webview. */
export async function saveDownloadedFile(
    destination: string, source: DownloadSource, signal: AbortSignal
): Promise<void> {
    const temporary = join(dirname(destination), `.spe-download-${randomUUID()}.tmp`);
    try {
        await pipeline(source(signal), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
        if (signal.aborted) { throw new Error('Download cancelled.'); }
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
}
