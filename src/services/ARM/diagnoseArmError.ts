/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArmError } from './armFetch';

export type ArmErrorKind =
    | { kind: 'policyBlocked'; policyName: string | undefined; targetType: string | undefined }
    | { kind: 'rbacInsufficient' }
    | { kind: 'regionConflict'; existingLocation: string | undefined }
    | { kind: 'spoTenantConflict' }
    | { kind: 'tenantSettingsUnreadable' }
    | { kind: 'unknown' };

/**
 * Classify an ARM error so the UI layer can show a tailored message.
 *
 * The 403/code-based cases are easy:
 *  - `policyBlocked`: 403, `code === 'RequestDisallowedByPolicy'`. Policy
 *    assignment name and disallowed target type are extracted from the body.
 *  - `rbacInsufficient`: 403, `code === 'AuthorizationFailed'`.
 *
 * The Syntex PUT-account call also surfaces several validation failures as
 * 400s with no useful `error.code` — we match on message-text prefixes
 * (lifted from the M365 admin center's billing UI which calls the same ARM
 * endpoint):
 *  - `regionConflict`: the Syntex account already exists in another region;
 *    common after a partial-success retry with a different RG.
 *  - `spoTenantConflict`: the RG is already bound to a different SharePoint
 *    tenant's Syntex account.
 *  - `tenantSettingsUnreadable`: SPO tenant id/url couldn't be resolved or
 *    failed validation.
 *
 * Anything else is `unknown` and the caller falls back to generic copy.
 *
 * Accepts `unknown` so call sites can pass `error: any` from a catch block
 * without extra narrowing.
 */
export function diagnoseArmError(error: unknown): ArmErrorKind {
    if (!(error instanceof ArmError)) {
        return { kind: 'unknown' };
    }

    if (error.status === 403 && error.code === 'AuthorizationFailed') {
        return { kind: 'rbacInsufficient' };
    }

    if (error.status === 403 && error.code === 'RequestDisallowedByPolicy') {
        return {
            kind: 'policyBlocked',
            policyName: extractPolicyName(error.body, error.message),
            targetType: extractTargetType(error.body, error.message)
        };
    }

    const innerMessage = extractInnerMessage(error.body) ?? error.message ?? '';

    if (innerMessage.startsWith(SYNTEX_ALREADY_EXISTS_PREFIX)) {
        return {
            kind: 'regionConflict',
            existingLocation: extractExistingLocation(innerMessage)
        };
    }

    if (
        innerMessage.startsWith('Cannot change SpoTenantId of the existing resource') ||
        innerMessage.startsWith('Cannot change SpoTenantUrl of the existing resource')
    ) {
        return { kind: 'spoTenantConflict' };
    }

    if (
        innerMessage.startsWith('Unable to read subscription settings') ||
        innerMessage.startsWith('TenantID mismatch') ||
        innerMessage.startsWith('TenantID format')
    ) {
        return { kind: 'tenantSettingsUnreadable' };
    }

    return { kind: 'unknown' };
}

const SYNTEX_ALREADY_EXISTS_PREFIX = "The resource 'Syntex' already exists in location";

/**
 * Extract the existing location from a Syntex region-conflict message.
 * Format: "The resource 'Syntex' already exists in location '<region>'..."
 */
function extractExistingLocation(message: string): string | undefined {
    const match = /already exists in location\s+'([^']+)'/i.exec(message);
    return match?.[1];
}

/**
 * The Syntex 400s wrap their message inside `body.error.message`. Fall back
 * to the surface message when no body is present.
 */
function extractInnerMessage(body: unknown): string | undefined {
    if (body && typeof body === 'object') {
        const b = body as any;
        const msg = b.error?.message ?? b.message;
        if (typeof msg === 'string') { return msg; }
    }
    return undefined;
}

/**
 * Pull the policy assignment name from an ARM RequestDisallowedByPolicy body.
 *
 * Two shapes are seen in practice:
 *  1. Structured: `body.error.additionalInfo[].info.policyAssignmentDisplayName`
 *     (preferred — human-readable, e.g. "Custom-AllowedResourceTypes") with
 *     `policyAssignmentName` as a fallback. In real responses
 *     `policyAssignmentName` is often a GUID, so the display name wins.
 *  2. Embedded in the message: the message string contains a JSON blob like
 *     `[{"policyAssignment":{"name":"init-allow-resource-type",...}}]`.
 *     We regex this out as a last resort.
 */
function extractPolicyName(body: unknown, message: string): string | undefined {
    const additionalInfo = readAdditionalInfo(body);
    for (const info of additionalInfo) {
        const obj = (info as any)?.info;
        if (obj && typeof obj === 'object') {
            const friendly = obj.policyAssignmentDisplayName;
            if (typeof friendly === 'string' && friendly.length > 0) {
                return friendly;
            }
            const fallback = obj.policyAssignmentName;
            if (typeof fallback === 'string' && fallback.length > 0) {
                return fallback;
            }
        }
    }

    const fromMessage = /"policyAssignment"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"/i.exec(message);
    if (fromMessage) {
        return fromMessage[1];
    }
    return undefined;
}

/**
 * Pull the disallowed resource type from the policy evaluation details.
 *
 * The structured location is
 * `error.additionalInfo[].info.evaluationDetails.evaluatedExpressions[]`
 * with `path === "type"` and `expressionValue` carrying the actual type
 * (e.g. `Microsoft.Syntex/accounts`).
 *
 * The message-text format is "Resource '<name>' was disallowed by policy",
 * where `<name>` is the resource *name* (a GUID for our Syntex accounts) —
 * so it's NOT a useful fallback for the type. We return undefined and let
 * the caller default to the resource type they were trying to provision.
 */
function extractTargetType(body: unknown, _message: string): string | undefined {
    const additionalInfo = readAdditionalInfo(body);
    for (const info of additionalInfo) {
        const exprs = (info as any)?.info?.evaluationDetails?.evaluatedExpressions;
        if (!Array.isArray(exprs)) { continue; }
        for (const e of exprs) {
            if (e && typeof e === 'object' && (e as any).path === 'type') {
                const value = (e as any).expressionValue;
                if (typeof value === 'string' && value.length > 0) {
                    return value;
                }
            }
        }
    }
    return undefined;
}

function readAdditionalInfo(body: unknown): unknown[] {
    if (!body || typeof body !== 'object') { return []; }
    const arr = (body as any).error?.additionalInfo ?? (body as any).additionalInfo;
    return Array.isArray(arr) ? arr : [];
}
