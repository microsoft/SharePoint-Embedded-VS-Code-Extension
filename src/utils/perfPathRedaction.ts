/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An opaque identifier: long, and mixing letters with digits. The digit requirement is what
 * keeps real route segments (`containerTypeRegistrations`, `applicationPermissionGrants`,
 * `customProperties`, …) intact, since none of them contain digits.
 */
const OPAQUE_ID = /^(?=.*\d)[A-Za-z0-9_-]{20,}$/;

/** Graph version segments, which legitimately contain a dot. */
const API_VERSION = /^(v\d+(\.\d+)?|beta)$/i;

/** A trailing file extension — i.e. the segment is a user-supplied file or folder name. */
const FILE_NAME = /\.[A-Za-z0-9]{1,5}$/;

/**
 * Replace every identifying path segment with a placeholder, leaving the route shape.
 *
 * Perf logs go to a file that users routinely attach to bug reports, so no tenant id,
 * container id, drive item id, application id, user principal name or file name may
 * appear in them. Templating also makes the summary useful: N calls to the same route
 * collapse into a single `×N` row instead of N separate lines.
 *
 * `/v1.0/storage/fileStorage/containerTypeRegistrations/7ea50786-…/applicationPermissionGrants/794cf0d3-…`
 * becomes
 * `/v1.0/storage/fileStorage/containerTypeRegistrations/{id}/applicationPermissionGrants/{id}`
 */
export function templatizeGraphPath(path: string): string {
    if (typeof path !== 'string' || !path) { return path; }

    const segments = path.split('/');
    const out: string[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment === '') { out.push(segment); continue; }

        // Path-addressed drive items (`…/root:/Reports/Q3.xlsx:/content`). Every segment
        // from here until the one closing the block is a user-authored name.
        const colon = segment.indexOf(':');
        if (colon !== -1) {
            out.push(`${segment.slice(0, colon)}:`, '{path}');
            let j = i + 1;
            while (j < segments.length && !segments[j].endsWith(':')) { j++; }
            // Resume after the closing segment, or stop if the block never closes.
            i = j < segments.length ? j : segments.length;
            continue;
        }

        out.push(templatizeSegment(segment));
    }

    return out.join('/');
}

function templatizeSegment(segment: string): string {
    if (API_VERSION.test(segment)) { return segment; }
    if (GUID.test(segment)) { return '{id}'; }
    if (segment.includes('@')) { return '{upn}'; }
    // SPE/SharePoint composite ids: `b!<base64>`, `siteId,webId,listId`.
    if (segment.includes('!') || segment.includes(',')) { return '{id}'; }
    // Percent-encoding only shows up on user-supplied values in these routes.
    if (segment.includes('%')) { return '{name}'; }
    if (OPAQUE_ID.test(segment)) { return '{id}'; }
    if (FILE_NAME.test(segment)) { return '{name}'; }
    return segment;
}
