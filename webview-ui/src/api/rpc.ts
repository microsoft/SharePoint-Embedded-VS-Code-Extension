import { isInsideVsCode, onExtensionMessage, postToExtension } from '../utils/vsbridge';
import type {
    OperationParams,
    OperationResult,
    SerializedError,
    StorageExplorerOperation,
} from './protocol';

/**
 * Typed request/response bridge to the extension host.
 *
 * The webview holds no Microsoft Graph credentials. Instead of issuing Graph calls
 * itself, it names an operation from `StorageExplorerOperations` and the host runs
 * it. That keeps the delegated bearer token inside the extension host, where a
 * compromised bundled dependency cannot read or replay it.
 */

/** An error that occurred while the extension host executed an operation. */
export class RpcError extends Error {
    public readonly statusCode?: number;
    public readonly code?: string;

    public constructor(error: SerializedError) {
        super(error.message);
        this.name = 'RpcError';
        this.statusCode = error.statusCode;
        this.code = error.code;
    }
}

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    onProgress?: (data: unknown) => void;
}

const _pending = new Map<string, PendingRequest>();
let _nextRequestId = 0;

onExtensionMessage('rpc/response', message => {
    const requestId = message.requestId as string | undefined;
    if (!requestId) return;
    const pending = _pending.get(requestId);
    if (!pending) return;
    _pending.delete(requestId);

    if (message.ok) {
        pending.resolve(message.result);
    } else {
        const error = (message.error as SerializedError | undefined)
            ?? { message: 'The extension host returned an unspecified error.' };
        pending.reject(new RpcError(error));
    }
});

onExtensionMessage('rpc/progress', message => {
    const requestId = message.requestId as string | undefined;
    if (!requestId) return;
    _pending.get(requestId)?.onProgress?.(message.data);
});

/**
 * Ask the extension host to run one operation.
 *
 * @param onProgress Invoked with incremental payloads for streaming operations
 *   (currently `drive.listChildren`, which emits the cumulative page contents).
 */
export function request<K extends StorageExplorerOperation>(
    op: K,
    params: OperationParams<K>,
    onProgress?: (data: unknown) => void,
): Promise<OperationResult<K>> {
    if (!isInsideVsCode()) {
        return Promise.reject(
            new Error(`Storage Explorer operation "${op}" requires the VS Code extension host.`),
        );
    }

    return new Promise<OperationResult<K>>((resolve, reject) => {
        const requestId = `${Date.now()}-${_nextRequestId++}`;
        _pending.set(requestId, {
            resolve: value => resolve(value as OperationResult<K>),
            reject,
            onProgress,
        });
        postToExtension({ command: 'rpc/request', requestId, op, params });
    });
}
