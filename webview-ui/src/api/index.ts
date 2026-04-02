import { createGraphClient } from './GraphClient';
import { WebviewAuthProvider } from './WebviewAuthProvider';
import { NetworkLogger } from './NetworkLoggingMiddleware';
import { ContainerGraphService } from './services/ContainerGraphService';
import { DriveGraphService } from './services/DriveGraphService';
import { PermissionGraphService } from './services/PermissionGraphService';
import { ColumnGraphService } from './services/ColumnGraphService';
import { PeopleGraphService } from './services/PeopleGraphService';
import { MeGraphService } from './services/MeGraphService';

export { WebviewAuthProvider };
export type { NetworkLogger };

/**
 * Create a fully-wired StorageExplorerApi.
 *
 * Pass the `WebviewAuthProvider` singleton and a `NetworkLogger` callback.
 * The logger is called for every Graph request (without auth tokens).
 */
export function createStorageExplorerApi(
    authProvider: WebviewAuthProvider,
    onNetworkRequest: NetworkLogger,
) {
    const client = createGraphClient(authProvider, onNetworkRequest);
    return {
        containers: new ContainerGraphService(client, authProvider),
        drive: new DriveGraphService(client, authProvider),
        permissions: new PermissionGraphService(client, authProvider),
        columns: new ColumnGraphService(client, authProvider),
        people: new PeopleGraphService(client, authProvider),
        me: new MeGraphService(client, authProvider),
    };
}

export type StorageExplorerApi = ReturnType<typeof createStorageExplorerApi>;
