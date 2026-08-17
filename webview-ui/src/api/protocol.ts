/**
 * Local re-export of the host/webview contract.
 *
 * The single source of truth lives with the extension host
 * (`src/services/StorageExplorer/protocol.ts`) so both sides cannot drift.
 * Everything here is a type — nothing crosses into the bundle at runtime.
 */
export type {
    ContainerCustomProperties,
    ContainerRole,
    CurrentUser,
    DriveItemDetails,
    DriveItemVersion,
    HostToWebviewMessage,
    ItemKind,
    MissingExtensionPermissionsCode,
    NetworkRequest,
    OperationParams,
    OperationResult,
    PeopleSuggestion,
    RpcProgressMessage,
    RpcRequestMessage,
    RpcResponseMessage,
    SerializedError,
    StorageExplorerOperation,
    StorageExplorerOperations,
    StorageExplorerPanelState,
    StorageItem,
    UploadChunkResult,
} from '../../../src/services/StorageExplorer/protocol';

import type { NetworkRequest as HostNetworkRequest } from '../../../src/services/StorageExplorer/protocol';

/** Sink for network log entries shown in the Network drawer. */
export type NetworkLogger = (request: HostNetworkRequest) => void;
