/**
 * Shared bridge for VS Code webview ↔ extension host communication.
 *
 * acquireVsCodeApi() may only be called once per webview session.
 * This module caches the result and exposes typed helpers for
 * posting messages and routing incoming messages, so every other
 * module can send/receive without each acquiring the API themselves.
 */

let _vscode: { postMessage: (msg: unknown) => void } | null | undefined;

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
    if (_vscode === undefined) {
        // acquireVsCodeApi is injected by VS Code at runtime; absent in a
        // normal browser (e.g. vite dev server).
        // @ts-ignore — runtime global, not present in lib types
        _vscode = typeof acquireVsCodeApi !== 'undefined'
            // @ts-ignore
            ? (acquireVsCodeApi as () => { postMessage: (msg: unknown) => void })()
            : null;
    }
    return _vscode;
}

/** Whether the webview is running inside VS Code (vs. a dev browser). */
export function isInsideVsCode(): boolean {
    return getVsCodeApi() !== null;
}

/** Send a message to the extension host. No-op outside VS Code. */
export function postToExtension(message: unknown): void {
    getVsCodeApi()?.postMessage(message);
}

// ── Incoming message routing ──────────────────────────────────────────────────

type MessagePayload = Record<string, unknown>;
type MessageHandler = (message: MessagePayload) => void;

const _handlers = new Map<string, Set<MessageHandler>>();

/**
 * Register a callback for a specific `command` value in messages arriving
 * from the extension host.  Returns an unsubscribe function.
 */
export function onExtensionMessage(
    command: string,
    handler: MessageHandler,
): () => void {
    if (!_handlers.has(command)) {
        _handlers.set(command, new Set());
    }
    _handlers.get(command)!.add(handler);
    return () => _handlers.get(command)?.delete(handler);
}

// Single global listener that fans incoming messages out to registered handlers.
window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as MessagePayload | null;
    if (!msg || typeof msg.command !== 'string') return;
    const handlers = _handlers.get(msg.command);
    if (handlers) {
        handlers.forEach(h => h(msg));
    }
});
