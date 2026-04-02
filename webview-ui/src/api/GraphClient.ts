import { Client, MiddlewareFactory, GraphError } from '@microsoft/microsoft-graph-client';
import { WebviewAuthProvider } from './WebviewAuthProvider';
import { NetworkLoggingMiddleware, NetworkLogger } from './NetworkLoggingMiddleware';

export { GraphError };

/**
 * Create a Graph SDK Client with:
 *  - NetworkLoggingMiddleware first (wraps full round-trip)
 *  - Default middleware chain (Auth → Retry → Telemetry → HTTP)
 */
export function createGraphClient(
    authProvider: WebviewAuthProvider,
    onNetworkRequest: NetworkLogger,
): Client {
    const loggingMiddleware = new NetworkLoggingMiddleware(onNetworkRequest);
    const defaultChain = MiddlewareFactory.getDefaultMiddlewareChain(authProvider);
    return Client.initWithMiddleware({
        middleware: [loggingMiddleware, ...defaultChain],
    });
}

/**
 * Execute `fn`, and on a 401 Unauthorized response automatically invalidate
 * the cached token and retry once.  A second 401 propagates as a real error.
 */
export async function withAuthRetry<T>(
    authProvider: WebviewAuthProvider,
    fn: () => Promise<T>,
): Promise<T> {
    try {
        return await fn();
    } catch (err: unknown) {
        if (err instanceof GraphError && err.statusCode === 401) {
            authProvider.invalidateCache();
            return await fn();
        }
        throw err;
    }
}
