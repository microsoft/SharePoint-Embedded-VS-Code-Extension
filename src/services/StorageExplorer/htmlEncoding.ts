/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Encoding helpers for the Storage Explorer webview HTML document.
 *
 * The panel's HTML is assembled by string concatenation, so every interpolated value is a
 * potential injection sink. Values reaching this document are **not** all extension-controlled:
 * the panel pre-seeds tenant- and app-controlled strings (the container type display name, the
 * tenant domain) that arrive from Microsoft Graph. In guest-app and cross-owner scenarios those
 * names need not have been chosen by the person opening the panel.
 *
 * This module is intentionally dependency-free (no `vscode`, no Node built-ins, no DOM) so it can
 * be unit-tested directly and, if ever needed, shared with the webview bundle.
 */

/**
 * Characters that are inert inside JSON but meaningful to the HTML tokenizer or the JS parser.
 *
 * - `<` and `>`: `JSON.stringify` does not escape them, so a string containing `</script>` closes
 *   the enclosing element early and the remainder of the document is parsed as markup.
 * - `&`: escaped so the payload cannot be reinterpreted if the JSON is ever moved into a context
 *   where HTML entity decoding applies (for example an attribute or a `<textarea>`).
 * - U+2028 / U+2029: legal in JSON strings but historically treated as line terminators by JS
 *   parsers, which breaks a string literal in two.
 *
 * Each replacement is a `\uXXXX` escape, which is valid inside a JSON string and decodes back to
 * the original character, so `JSON.parse` round-trips the value unchanged.
 */
const JSON_HTML_ESCAPE_PATTERN = /[<>&\u2028\u2029]/g;

function jsonHtmlEscape(char: string): string {
    // A `\uXXXX` escape derived from the code point: valid inside a JSON string, and it decodes
    // back to the original character so `JSON.parse` round-trips the value unchanged.
    const code = char.charCodeAt(0).toString(16);
    return `\\u${'0000'.slice(code.length)}${code}`;
}

const HTML_ATTRIBUTE_ESCAPE_PATTERN = /[&<>"']/g;

function htmlAttributeEscape(char: string): string {
    switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
    }
}

/**
 * Serialize a value for embedding in an HTML document as JSON.
 *
 * The result is safe to place inside a `<script type="application/json">` block: it cannot
 * terminate the element, cannot introduce markup, and `JSON.parse` returns the original value.
 *
 * Values that `JSON.stringify` cannot represent (`undefined`, functions, symbols) serialize to
 * `null` rather than the literal `undefined`, which would be a syntax error for `JSON.parse`.
 */
export function serializeJsonForHtml(value: unknown): string {
    const json = JSON.stringify(value);
    if (json === undefined) {
        return 'null';
    }
    return json.replace(JSON_HTML_ESCAPE_PATTERN, jsonHtmlEscape);
}

/**
 * Escape a value for use inside a double- or single-quoted HTML attribute.
 *
 * Applied to the generated resource URIs and the CSP nonce. Those are all extension-controlled
 * today, so this is defence in depth: it keeps the document safe if a future change routes a less
 * trustworthy value through the same template.
 *
 * Deliberately **not** used on the CSP string itself. A CSP contains single quotes by design
 * (`'none'`, `'nonce-…'`), and escaping them would make the one control that gates script
 * execution depend on the parser decoding `&#39;` back before the policy is read. Correct per
 * spec, but not a dependency worth taking on a security header — see {@link sanitizeCspSource}.
 */
export function escapeHtmlAttribute(value: string): string {
    return value.replace(HTML_ATTRIBUTE_ESCAPE_PATTERN, htmlAttributeEscape);
}

/**
 * Characters that may appear in a CSP source expression.
 *
 * `webview.cspSource` is a **source list**, not a single token: VS Code returns
 * `'self' https://*.vscode-cdn.net`. It therefore has to survive space separation and quoted
 * keyword sources — an earlier character-stripping version collapsed it to one garbage host and
 * silently broke every stylesheet, font and image in the panel.
 */

/** A host/scheme source such as `https://*.vscode-cdn.net`, `vscode-webview://<uuid>` or `data:`. */
const CSP_HOST_SOURCE = /^[A-Za-z0-9][A-Za-z0-9:/.\-*+%_]*$|^\*$/;

/**
 * Quoted keyword sources that may be carried through.
 *
 * Deliberately excludes `'unsafe-inline'`, `'unsafe-eval'` and `'strict-dynamic'`: those widen the
 * policy, and this function's job is to be fail-safe. Dropping an unrecognised keyword narrows the
 * policy rather than widening it.
 */
const CSP_ALLOWED_KEYWORDS = ['\'self\'', '\'none\''];

/**
 * Reduce a CSP source list to tokens that are certainly safe to emit.
 *
 * `webview.cspSource` is the only value in the policy that is not a literal. Each whitespace-
 * separated token is kept only if it is a recognised keyword or matches the host-source shape;
 * anything else is dropped. Because no surviving token can contain a quote, `<`, `>`, `&`, `;` or
 * whitespace, the rebuilt list can neither escape the enclosing attribute nor inject a further
 * directive — while a legitimate value passes through unchanged.
 */
export function sanitizeCspSource(value: string): string {
    const kept: string[] = [];
    for (const token of value.split(/\s+/)) {
        if (!token) {
            continue;
        }
        if (CSP_ALLOWED_KEYWORDS.indexOf(token.toLowerCase()) !== -1 || CSP_HOST_SOURCE.test(token)) {
            kept.push(token);
        }
    }
    return kept.join(' ');
}
