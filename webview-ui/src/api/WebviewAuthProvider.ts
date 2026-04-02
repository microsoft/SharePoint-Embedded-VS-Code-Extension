import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { postToExtension, onExtensionMessage } from '../utils/vsbridge';

/** Well-known resource IDs for Microsoft Graph. */
const GRAPH_AUDIENCES = new Set([
    'https://graph.microsoft.com',
    '00000003-0000-0000-c000-000000000000',
]);

/** Proactively refresh the token this many ms before its actual expiry. */
const EXPIRY_BUFFER_MS = 60_000;

interface CachedToken {
    raw: string;
    /** Timestamp in ms (from JWT `exp` claim) after which the token is expired. */
    expiresAtMs: number;
}

/**
 * Decode the JWT payload and return the expiry timestamp in ms.
 * Returns null if the token is malformed.
 */
function parseExpiry(token: string): number | null {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

/**
 * Validate the cached token's JWT claims proactively.
 *
 * Returns false if the token is:
 *  - absent or unparseable
 *  - not intended for Microsoft Graph (wrong `aud`)
 *  - not yet valid (`nbf` is in the future)
 *  - within EXPIRY_BUFFER_MS of its stated expiry
 */
function isCachedTokenValid(cached: CachedToken | null): boolean {
    if (!cached) return false;
    try {
        const payload = JSON.parse(atob(cached.raw.split('.')[1]));

        // Audience check — token must be for MS Graph
        const aud: string | string[] = payload.aud;
        const auds = Array.isArray(aud) ? aud : [aud];
        if (!auds.some(a => GRAPH_AUDIENCES.has(a))) return false;

        // Not-before check
        const nbf: number = payload.nbf ?? 0;
        if (Date.now() < nbf * 1000) return false;

        // Expiry check (with buffer so we renew before the token actually expires)
        if (Date.now() >= cached.expiresAtMs - EXPIRY_BUFFER_MS) return false;

        return true;
    } catch {
        return false;
    }
}

/**
 * Graph SDK AuthenticationProvider that fetches tokens from the VS Code
 * extension host via message passing.
 *
 * Tokens are cached and reused until they are close to expiry (or
 * explicitly invalidated on a 401 response).  The message-passing round-trip
 * to the extension only occurs when the cached token is absent or stale.
 */
export class WebviewAuthProvider implements AuthenticationProvider {
    private _cached: CachedToken | null = null;
    private _pending = new Map<
        string,
        { resolve: (token: string) => void; reject: (err: Error) => void }
    >();

    constructor() {
        // Seed the cache from the token pre-fetched by the extension host at
        // panel creation time.  This eliminates the cold-start latency on the
        // first Graph call — no message-passing round-trip needed.
        const initialToken = window.__STORAGE_EXPLORER_STATE__?.initialToken;
        if (initialToken) {
            const expiresAtMs = parseExpiry(initialToken) ?? Date.now() + 50 * 60 * 1000;
            const candidate: CachedToken = { raw: initialToken, expiresAtMs };
            if (isCachedTokenValid(candidate)) {
                this._cached = candidate;
            }
        }

        onExtensionMessage('tokenResponse', (msg) => {
            const requestId = msg.requestId as string | undefined;
            if (!requestId) return;
            const pending = this._pending.get(requestId);
            if (!pending) return;
            this._pending.delete(requestId);
            if (msg.error) {
                pending.reject(new Error(msg.error as string));
            } else if (msg.token) {
                pending.resolve(msg.token as string);
            } else {
                pending.reject(new Error('tokenResponse: missing token'));
            }
        });
    }

    public async getAccessToken(): Promise<string> {
        if (isCachedTokenValid(this._cached)) {
            return this._cached!.raw;
        }
        const token = await this._requestToken();
        const expiresAtMs = parseExpiry(token) ?? Date.now() + 50 * 60 * 1000;
        this._cached = { raw: token, expiresAtMs };
        return token;
    }

    /**
     * Discard the cached token so the next getAccessToken() call fetches
     * a fresh one from the extension.  Call this after receiving a 401
     * response from Graph.
     */
    public invalidateCache(): void {
        this._cached = null;
    }

    private _requestToken(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            this._pending.set(requestId, { resolve, reject });
            postToExtension({ command: 'getToken', requestId });

            // Safety net: reject if the extension does not respond
            setTimeout(() => {
                if (this._pending.has(requestId)) {
                    this._pending.delete(requestId);
                    reject(new Error('getToken timed out after 15 s'));
                }
            }, 15_000);
        });
    }
}
