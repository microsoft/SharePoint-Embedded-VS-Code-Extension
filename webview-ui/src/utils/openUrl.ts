/**
 * Utility for opening URLs from inside the VS Code webview.
 *
 * Inside VS Code, `window.open` is sandboxed and will not open external URLs.
 * The correct approach is to post an `openExternal` message to the extension
 * host, which then calls `vscode.env.openExternal(url)`.
 *
 * Outside VS Code (e.g. dev server in a normal browser), we fall back to
 * `window.open` so the developer experience is unaffected.
 */

// acquireVsCodeApi() must be called at most once per webview session.
// We cache the result here at module level.
let _vscode: { postMessage: (msg: unknown) => void } | null | undefined;

function getVsCode() {
    if (_vscode === undefined) {
        // @ts-ignore — injected by VS Code at runtime
        _vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
    }
    return _vscode;
}

/**
 * Open `url` in the user's default external browser.
 *
 * - Inside VS Code: sends `{ command: 'openExternal', url }` to the extension host.
 * - Outside VS Code: delegates to `window.open`.
 */
export function openUrl(url: string): void {
    const vscode = getVsCode();
    if (vscode) {
        vscode.postMessage({ command: 'openExternal', url });
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}
