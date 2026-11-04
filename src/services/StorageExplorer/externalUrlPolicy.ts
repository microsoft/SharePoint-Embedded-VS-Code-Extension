/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URL } from 'url';

/**
 * Allow-list policy for URLs the Storage Explorer webview asks the extension host to
 * hand to the operating system via `vscode.env.openExternal`.
 *
 * `openExternal` escapes the webview sandbox entirely: it is not constrained by the
 * panel's CSP, so an unrestricted handler is a general-purpose egress channel (and, for
 * schemes like `file:`, `vscode:` or `command:`, a local-action primitive). Every URL the
 * feature legitimately opens originates from a Microsoft Graph response, so the policy is
 * default-deny with a small, explicitly reviewed set of destinations.
 */

/**
 * Registrable domains whose subdomains may be opened over HTTPS.
 *
 * These are the hosts Graph returns for the four things this feature opens:
 * `driveItem.webUrl`, `@microsoft.graph.downloadUrl`, `/preview`'s `getUrl`, and version
 * download URLs. The `sharepoint.*` entries cover the commercial and sovereign clouds;
 * `officeapps.live.com` covers the Office Online viewer that `/preview` can hand back for
 * Office documents.
 */
const ALLOWED_HTTPS_DOMAINS = [
    'sharepoint.com',            // commercial
    'sharepoint.us',             // GCC High
    'sharepoint-mil.us',         // DoD
    'sharepoint.de',             // Germany
    'partner.sharepointonline.cn', // 21Vianet (China)
    'officeapps.live.com',       // Office Online preview/edit surface
];

/**
 * Office desktop-client URI schemes used by "Open in desktop".
 *
 * Each is reviewed: the handler is a Microsoft Office client, and the only payload form
 * produced (and accepted) is `ofe|u|<https url>` — "open for edit" against a URL that must
 * itself satisfy the HTTPS policy below.
 */
const ALLOWED_OFFICE_SCHEMES = ['ms-word:', 'ms-excel:', 'ms-powerpoint:'];

/** `ofe|u|<url>` — the only Office deep-link command this feature emits. */
const OFFICE_PAYLOAD_PREFIX = 'ofe|u|';

/** Defensive bound; real SPO URLs with tokens run long but nowhere near this. */
const MAX_URL_LENGTH = 4096;

/**
 * Characters that must never appear in a URL string before parsing.
 *
 * Whitespace, control characters and backslashes are the classic sources of
 * parser-differential bugs: two URL parsers can disagree about where the authority ends,
 * which would let a validated-then-reparsed URL resolve to a different host than the one
 * this policy approved.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_URL_CHARS = /[\s\\\u0000-\u001f\u007f]/;

/** Outcome of evaluating a URL against the policy. */
export type ExternalUrlDecision =
    | { allowed: true; url: string; description: string }
    | { allowed: false; reason: string; description: string };

/**
 * Describe a URL for logging without disclosing its secrets.
 *
 * SPO download and preview URLs carry pre-authenticated access tokens in their query
 * string; those tokens are bearer capabilities for the file, so the full URL must never
 * reach the output channel. Only the scheme and host are safe to record.
 */
export function describeUrlForLog(raw: string): string {
    if (typeof raw !== 'string' || !raw) { return '<empty>'; }
    try {
        const parsed = new URL(raw);
        return parsed.hostname
            ? `${parsed.protocol}//${parsed.hostname}`
            : `${parsed.protocol}<opaque>`;
    } catch {
        return '<unparseable>';
    }
}

/** True when `hostname` is `domain` itself or a subdomain of it. */
function matchesDomain(hostname: string, domain: string): boolean {
    if (hostname === domain) { return true; }
    // The leading dot is what stops `evil-sharepoint.com` and `sharepoint.com.evil.io`
    // from matching: only a full label boundary counts.
    return hostname.length > domain.length + 1
        && hostname.charAt(hostname.length - domain.length - 1) === '.'
        && hostname.slice(hostname.length - domain.length) === domain;
}

/** Validate an `https:` URL against the host allow-list. */
function checkHttpsUrl(parsed: URL): string | undefined {
    if (parsed.protocol !== 'https:') {
        return `scheme '${parsed.protocol}' is not permitted; only https is`;
    }
    // Credentials in a URL are never produced by this feature. They are also a phishing
    // primitive (`https://trusted.sharepoint.com@attacker.example`) that some external
    // handlers render misleadingly.
    if (parsed.username || parsed.password) {
        return 'URL contains embedded credentials';
    }
    if (parsed.port) {
        return `non-default port '${parsed.port}' is not permitted`;
    }
    const hostname = parsed.hostname.toLowerCase();
    for (const domain of ALLOWED_HTTPS_DOMAINS) {
        if (matchesDomain(hostname, domain)) { return undefined; }
    }
    return `host '${hostname}' is not in the allow-list`;
}

/**
 * Decide whether `raw` may be handed to the operating system.
 *
 * Default-deny: anything not matching an explicitly reviewed shape is rejected, including
 * `file:`, `vscode:`, `command:`, `data:`, `javascript:`, and every other unrecognised
 * scheme, plus URLs carrying credentials or pointing at unexpected hosts.
 */
export function evaluateExternalUrl(raw: unknown): ExternalUrlDecision {
    if (typeof raw !== 'string' || !raw) {
        return { allowed: false, reason: 'URL is missing or not a string', description: '<invalid>' };
    }
    if (raw.length > MAX_URL_LENGTH) {
        return { allowed: false, reason: 'URL exceeds the maximum permitted length', description: '<oversized>' };
    }
    if (FORBIDDEN_URL_CHARS.test(raw)) {
        return {
            allowed: false,
            reason: 'URL contains whitespace, control characters, or a backslash',
            description: '<malformed>',
        };
    }

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return { allowed: false, reason: 'URL could not be parsed', description: '<unparseable>' };
    }

    const description = describeUrlForLog(raw);

    // ── Office desktop deep links ────────────────────────────────────────────────
    if (ALLOWED_OFFICE_SCHEMES.indexOf(parsed.protocol) !== -1) {
        // For these non-special schemes the whole command sits in the opaque path.
        const payload = parsed.pathname;
        if (payload.slice(0, OFFICE_PAYLOAD_PREFIX.length) !== OFFICE_PAYLOAD_PREFIX) {
            return {
                allowed: false,
                reason: `Office deep link must use the '${OFFICE_PAYLOAD_PREFIX}' command`,
                description,
            };
        }
        const inner = payload.slice(OFFICE_PAYLOAD_PREFIX.length);
        let innerParsed: URL;
        try {
            innerParsed = new URL(inner);
        } catch {
            return { allowed: false, reason: 'Office deep link target could not be parsed', description };
        }
        // Without this the scheme allow-list could be bypassed by nesting, e.g.
        // `ms-word:ofe|u|file:///…`.
        const innerProblem = checkHttpsUrl(innerParsed);
        if (innerProblem) {
            return { allowed: false, reason: `Office deep link target rejected: ${innerProblem}`, description };
        }
        return { allowed: true, url: raw, description: `${parsed.protocol}//${innerParsed.hostname}` };
    }

    // ── Plain HTTPS ──────────────────────────────────────────────────────────────
    const problem = checkHttpsUrl(parsed);
    if (problem) {
        return { allowed: false, reason: problem, description };
    }
    // Hand on the parser's normalized serialization so what is opened is exactly what was
    // validated, with no room for a second parser to read the string differently.
    return { allowed: true, url: parsed.href, description };
}

/** Exposed for tests and for documenting the reviewed destination set. */
export const externalUrlPolicy = {
    allowedHttpsDomains: ALLOWED_HTTPS_DOMAINS,
    allowedOfficeSchemes: ALLOWED_OFFICE_SCHEMES,
};
