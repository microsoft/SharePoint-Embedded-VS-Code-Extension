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

import { isInsideVsCode, postToExtension } from './vsbridge';

/**
 * Open `url` in the user's default external browser.
 *
 * - Inside VS Code: sends `{ command: 'openExternal', url }` to the extension host.
 * - Outside VS Code: delegates to `window.open`.
 */
export function openUrl(url: string): void {
    if (isInsideVsCode()) {
        postToExtension({ command: 'openExternal', url });
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}
