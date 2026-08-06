import { onExtensionMessage } from '../utils/vsbridge';
import { ColumnGraphService } from './services/ColumnGraphService';
import { ContainerGraphService } from './services/ContainerGraphService';
import { DriveGraphService } from './services/DriveGraphService';
import { MeGraphService } from './services/MeGraphService';
import { PeopleGraphService } from './services/PeopleGraphService';
import { PermissionGraphService } from './services/PermissionGraphService';
import type { NetworkLogger, NetworkRequest } from './protocol';

export { RpcError } from './rpc';
export type { NetworkLogger };

/**
 * Create a fully-wired StorageExplorerApi.
 *
 * None of these services hold credentials: each one forwards a named operation to
 * the extension host, which owns the delegated Microsoft Graph token.
 *
 * `onNetworkRequest` only receives entries for requests the *webview* issues itself
 * (pre-authenticated upload-session chunks). Host-side Graph traffic arrives
 * separately — see `onHostNetworkRequest`.
 */
export function createStorageExplorerApi(onNetworkRequest: NetworkLogger) {
    return {
        containers: new ContainerGraphService(),
        drive: new DriveGraphService(onNetworkRequest),
        permissions: new PermissionGraphService(),
        columns: new ColumnGraphService(),
        people: new PeopleGraphService(),
        me: new MeGraphService(),
    };
}

export type StorageExplorerApi = ReturnType<typeof createStorageExplorerApi>;

/**
 * Subscribe to Graph traffic logged by the extension host so the Network drawer
 * keeps showing every request. Authorization headers are stripped host-side.
 * Returns an unsubscribe function.
 */
export function onHostNetworkRequest(handler: NetworkLogger): () => void {
    return onExtensionMessage('networkLog', message => {
        const req = message.request as NetworkRequest | undefined;
        if (req) handler(req);
    });
}
