/**
 * Local re-export of the host/webview contract.
 *
 * The single source of truth lives with the extension host
 * (`src/services/StorageExplorer/protocol.ts`) so both sides cannot drift.
 * Everything here is a type — nothing crosses into the bundle at runtime.
 */
export type {
    AuthorizationSnapshot,
    CollectionScope,
    ContainerCustomProperties,
    ContainerRole,
    ContinuationToken,
    CurrentUser,
    DriveItemDetails,
    DriveItemVersion,
    HostToWebviewMessage,
    ItemKind,
    MissingExtensionPermissionsCode,
    NetworkRequest,
    OperationParams,
    OperationResult,
    PagedResult,
    PeopleSuggestion,
    RpcProgressMessage,
    RpcRequestMessage,
    RpcResponseMessage,
    SerializedError,
    StorageCollectionKind,
    StorageExplorerOperation,
    StorageExplorerOperations,
    StorageExplorerPanelState,
    StorageExplorerReadiness,
    StorageItem,
    UploadChunkResult,
} from '../../../src/services/StorageExplorer/protocol';

import type { NetworkRequest as HostNetworkRequest } from '../../../src/services/StorageExplorer/protocol';

/** Sink for network log entries shown in the Network drawer. */
export type NetworkLogger = (request: HostNetworkRequest) => void;
