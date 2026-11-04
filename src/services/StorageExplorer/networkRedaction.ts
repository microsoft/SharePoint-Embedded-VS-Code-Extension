/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NetworkRequest } from './protocol';

/**
 * Redaction for the Storage Explorer network drawer and its HAR export.
 *
 * The drawer is a developer diagnostic, but its contents are routinely exported and
 * attached to bug reports, so anything **bearer-equivalent** must never reach it. Three
 * classes of material are removed:
 *
 * 1. **Pre-authenticated URLs.** SharePoint download, preview, and upload-session URLs
 *    embed their own credential. Possession of the URL *is* access to the file — an
 *    upload-session URL is a write capability valid for ~24h — so they are as sensitive
 *    as the bearer token itself.
 * 2. **Tokens and secrets** appearing in headers, query strings, or JSON bodies.
 * 3. **Directory PII** (email addresses / UPNs) returned by the people picker and
 *    permission APIs, which is masked rather than dropped so shapes stay debuggable.
 *
 * This module is deliberately dependency-free (no `vscode`, no Node built-ins, no DOM) so
 * the identical logic runs in the extension host and in the webview, which logs its own
 * pre-authenticated chunk-upload PUTs.
 */

export const REDACTED = '[redacted]';

/** Bodies above this are truncated; a full listing page is ~100 KB and rarely needed whole. */
const MAX_BODY_LENGTH = 64 * 1024;

/**
 * Hosts whose query strings are diagnostically valuable and carry no credential.
 *
 * Graph authenticates with an `Authorization` header, so its query string is pure OData
 * (`$select`, `$filter`, `$skiptoken`) and is preserved. Every *other* host this feature
 * talks to is reached through a pre-authenticated URL, where the query string **is** the
 * credential — so for those the entire query and fragment are dropped.
 */
const QUERY_SAFE_HOSTS = ['graph.microsoft.com'];

/** Query parameter names that carry a credential even on an otherwise safe host. */
const SENSITIVE_QUERY_KEYS = [
    'access_token', 'accesstoken', 'id_token', 'refresh_token', 'code',
    'tempauth', 'authkey', 'ak', 'guestaccesstoken', 'token',
    'sig', 'signature', 'client_secret', 'password', 'pwd', 'secret',
    'se', 'sp', 'sv', 'sr', 'skoid', 'sig_ver',
];

/** Headers dropped from logs entirely. */
const SENSITIVE_HEADERS = [
    'authorization', 'cookie', 'set-cookie', 'proxy-authorization',
    'www-authenticate', 'x-api-key', 'api-key', 'secret',
];

/**
 * JSON keys whose string value is a capability URL or a secret, redacted regardless of
 * how the value looks. These are the fields Graph uses to hand back pre-authenticated
 * URLs, so key-based removal is more reliable than pattern-matching the value.
 */
const SENSITIVE_JSON_KEYS = [
    '@microsoft.graph.downloadurl', '@content.downloadurl', 'downloadurl',
    'uploadurl', 'geturl', 'preauthorizedurl',
    'access_token', 'accesstoken', 'id_token', 'refresh_token',
    'token', 'secret', 'client_secret', 'clientsecret', 'password',
];

/**
 * Keys that are sensitive only in context.
 *
 * A driveItem's `webUrl` is an ordinary SPO link that still requires sign-in, but the
 * `webUrl` inside a sharing-link `link` object is the sharing capability itself — often
 * anonymously redeemable — and its secret sits in the path, where query redaction cannot
 * reach it.
 */
const CONTEXTUAL_SENSITIVE_KEYS: { [parentKey: string]: string[] } = {
    link: ['weburl'],
    sharinglink: ['weburl'],
};

/** Matches an email address / UPN. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Bearer/JWT-shaped strings that may appear inline in a body or header value. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

function isSensitiveName(name: string, list: string[]): boolean {
    return list.indexOf(name.toLowerCase()) !== -1;
}

/**
 * Mask an email address, preserving its shape and domain.
 *
 * Keeping the domain makes tenant-level debugging possible without exposing an
 * addressable identifier that could be harvested from a shared HAR.
 */
function maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) { return REDACTED; }
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    return `${local.charAt(0)}***@${domain}`;
}

/** Split a URL into `{ base, query, fragment }` without needing a URL parser. */
function splitUrl(url: string): { base: string; query: string; fragment: string } {
    let rest = url;
    let fragment = '';
    const hash = rest.indexOf('#');
    if (hash !== -1) {
        fragment = rest.slice(hash + 1);
        rest = rest.slice(0, hash);
    }
    let query = '';
    const q = rest.indexOf('?');
    if (q !== -1) {
        query = rest.slice(q + 1);
        rest = rest.slice(0, q);
    }
    return { base: rest, query, fragment };
}

/** Extract the lowercase hostname from an absolute URL, or '' if there isn't one. */
function hostOf(url: string): string {
    const schemeEnd = url.indexOf('://');
    if (schemeEnd === -1) { return ''; }
    const afterScheme = url.slice(schemeEnd + 3);
    let end = afterScheme.length;
    for (const delimiter of ['/', '?', '#']) {
        const index = afterScheme.indexOf(delimiter);
        if (index !== -1 && index < end) { end = index; }
    }
    let authority = afterScheme.slice(0, end);
    const at = authority.lastIndexOf('@');
    if (at !== -1) { authority = authority.slice(at + 1); }
    const colon = authority.indexOf(':');
    if (colon !== -1) { authority = authority.slice(0, colon); }
    return authority.toLowerCase();
}

/**
 * Strip credential material from a URL while keeping it recognisable.
 *
 * On Graph the query string is OData and is kept, minus any individually sensitive key.
 * On every other host the URL is pre-authenticated, so the whole query and fragment go.
 */
export function redactUrl(url: string): string {
    if (typeof url !== 'string' || !url) { return url; }

    const { base, query, fragment } = splitUrl(url);
    const host = hostOf(url);
    const querySafe = QUERY_SAFE_HOSTS.indexOf(host) !== -1;

    if (!querySafe) {
        // Pre-authenticated URL: the credential is the query string (and sometimes the
        // fragment), so neither is preserved.
        const suffix = query || fragment ? `?${REDACTED}` : '';
        return `${base}${suffix}`;
    }

    let redactedQuery = '';
    if (query) {
        const parts: string[] = [];
        for (const pair of query.split('&')) {
            if (!pair) { continue; }
            const eq = pair.indexOf('=');
            const key = eq === -1 ? pair : pair.slice(0, eq);
            if (eq !== -1 && isSensitiveName(decodeURIComponent(key), SENSITIVE_QUERY_KEYS)) {
                parts.push(`${key}=${REDACTED}`);
            } else {
                parts.push(pair);
            }
        }
        redactedQuery = parts.join('&');
    }

    const fragmentPart = fragment ? `#${REDACTED}` : '';
    return `${base}${redactedQuery ? `?${redactedQuery}` : ''}${fragmentPart}`;
}

/** Redact a free-text value that may embed URLs, JWTs, or email addresses. */
function redactText(value: string): string {
    let out = value.replace(JWT_PATTERN, REDACTED);
    out = out.replace(/https?:\/\/[^\s"'<>\\]+/g, match => redactUrl(match));
    out = out.replace(EMAIL_PATTERN, match => maskEmail(match));
    return out;
}

/** Drop sensitive headers and redact URLs/tokens inside the values that remain. */
export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) { return out; }
    for (const name of Object.keys(headers)) {
        if (isSensitiveName(name, SENSITIVE_HEADERS)) {
            out[name] = REDACTED;
            continue;
        }
        out[name] = redactText(String(headers[name]));
    }
    return out;
}

/** Recursively redact a parsed JSON value. */
function redactJson(value: unknown, parentKey?: string): unknown {
    if (typeof value === 'string') { return redactText(value); }
    if (!value || typeof value !== 'object') { return value; }

    if (Array.isArray(value)) {
        return value.map(entry => redactJson(entry, parentKey));
    }

    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const contextual = parentKey ? CONTEXTUAL_SENSITIVE_KEYS[parentKey.toLowerCase()] : undefined;

    for (const key of Object.keys(source)) {
        const lower = key.toLowerCase();
        if (isSensitiveName(lower, SENSITIVE_JSON_KEYS)
            || (contextual && contextual.indexOf(lower) !== -1)) {
            out[key] = REDACTED;
            continue;
        }
        out[key] = redactJson(source[key], key);
    }
    return out;
}

/**
 * Redact a request or response body.
 *
 * JSON is parsed so redaction can be key-aware; anything else falls back to text-level
 * pattern redaction. Both paths are length-capped.
 */
export function redactBody(body: string | undefined): string | undefined {
    if (body === undefined || body === null) { return undefined; }
    if (typeof body !== 'string') { return undefined; }
    if (!body) { return body; }

    // Synthetic placeholders such as "[5898240 bytes]" contain nothing to redact.
    if (body.charAt(0) === '[' && body.charAt(body.length - 1) === ']' && body.indexOf('bytes') !== -1) {
        return body;
    }

    let out: string;
    const first = body.charAt(0);
    if (first === '{' || first === '[') {
        try {
            out = JSON.stringify(redactJson(JSON.parse(body)));
        } catch {
            out = redactText(body.slice(0, MAX_BODY_LENGTH));
        }
    } else {
        out = redactText(body.slice(0, MAX_BODY_LENGTH));
    }

    // Compare against the *original* length too: a body trimmed before redaction can come
    // back at or under the cap and would otherwise lose its truncation marker.
    if (out.length > MAX_BODY_LENGTH || body.length > MAX_BODY_LENGTH) {
        out = `${out.slice(0, MAX_BODY_LENGTH)}… [truncated]`;
    }
    return out;
}

/**
 * Produce a log-safe copy of a captured request.
 *
 * Applied at the point of capture so bearer-equivalent material never enters the drawer
 * state, never crosses to the webview, and therefore cannot reach a HAR export.
 */
export function redactNetworkRequest(request: NetworkRequest): NetworkRequest {
    return {
        ...request,
        url: redactUrl(request.url),
        requestHeaders: redactHeaders(request.requestHeaders),
        requestBody: redactBody(request.requestBody),
        responseHeaders: redactHeaders(request.responseHeaders),
        responseBody: redactBody(request.responseBody),
        error: request.error ? redactText(request.error) : request.error,
    };
}
