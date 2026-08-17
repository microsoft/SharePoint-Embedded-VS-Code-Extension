/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MissingExtensionPermissionsCode, SerializedError } from './protocol';

/** See `MissingExtensionPermissionsCode`. Annotated so a rename on either side fails to compile. */
export const MISSING_EXTENSION_PERMISSIONS_CODE: MissingExtensionPermissionsCode = 'missingExtensionAppPermissions';

/**
 * Whether a failed Graph call was rejected because the caller is not *authorized*.
 *
 * SharePoint Embedded returns a bare `403 Access denied` when the calling app has no
 * permission grant on the container type, so the status code is the primary signal.
 * `401` is deliberately excluded: that is an *authentication* failure (expired token,
 * revoked consent, conditional access) whose remedy is signing in again, not granting
 * the extension app permissions. Some transports surface a denial without a status
 * code, hence the message and error-code fallbacks.
 *
 * Kept free of `vscode` so it can be unit-tested in the Node-only API suite.
 */
export function isAccessDeniedError(error: SerializedError): boolean {
    if (error.statusCode === 403) {
        return true;
    }
    // Any other status code is a definitive answer — don't second-guess it by
    // pattern-matching the message (a 404 body can still mention "access").
    if (typeof error.statusCode === 'number') {
        return false;
    }
    const haystack = `${error.code ?? ''} ${error.message ?? ''}`;
    return /access\s*denied|accessdenied|forbidden/i.test(haystack);
}

/**
 * Message shown in the webview when the extension app is missing its container-type
 * permission grant. Mirrors the wording of the tree view's prompt.
 */
export const MISSING_EXTENSION_PERMISSIONS_MESSAGE =
    'The SharePoint Embedded extension does not have permissions on this container type, so its containers cannot be listed. Grant the extension app permissions and try again.';

export interface AccessDenialDiagnosis {
    /** The error to send to the webview — tagged when the cause was identified. */
    error: SerializedError;
    /** True when the denial was traced to a missing extension-app permission grant. */
    missingPermissions: boolean;
}

/**
 * Turn an opaque `Access denied` into an actionable one.
 *
 * SPE rejects container calls with a bare 403 when the 1P extension app has no permission
 * grant on the container type. That is indistinguishable from any other authorization
 * failure at the response level, so re-run the same check the Development tree does and
 * tag the error when it comes back negative.
 *
 * `hasPermissions` is injected (rather than imported) so this stays free of `vscode` and
 * can be exercised by the Node-only API suite and the standalone webview harness.
 */
export async function diagnoseAccessDenied(
    error: SerializedError,
    hasPermissions: () => Promise<boolean>,
): Promise<AccessDenialDiagnosis> {
    if (!isAccessDeniedError(error)) {
        return { error, missingPermissions: false };
    }

    let granted: boolean;
    try {
        granted = await hasPermissions();
    } catch {
        // The diagnosis is best-effort — never mask or replace the original failure.
        return { error, missingPermissions: false };
    }
    if (granted) {
        return { error, missingPermissions: false };
    }

    return {
        error: {
            ...error,
            code: MISSING_EXTENSION_PERMISSIONS_CODE,
            message: MISSING_EXTENSION_PERMISSIONS_MESSAGE,
        },
        missingPermissions: true,
    };
}
