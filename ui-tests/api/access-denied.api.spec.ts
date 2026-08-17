/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import {
    diagnoseAccessDenied,
    isAccessDeniedError,
    MISSING_EXTENSION_PERMISSIONS_CODE,
    MISSING_EXTENSION_PERMISSIONS_MESSAGE,
} from '../../src/services/StorageExplorer/accessDenied';

const denied = async () => false;
const granted = async () => true;

test.describe('isAccessDeniedError', () => {
    test('treats 403 as access denied', () => {
        expect(isAccessDeniedError({ message: 'Access denied', statusCode: 403 })).toBe(true);
    });

    test('does not treat 401 as access denied', () => {
        // 401 is an authentication failure — the remedy is signing in again, not granting
        // the extension app permissions on the container type.
        expect(isAccessDeniedError({ message: 'Unauthenticated', statusCode: 401 })).toBe(false);
    });

    test('trusts a non-auth status code over the message text', () => {
        // A 404 body that happens to mention access must not be re-classified.
        expect(isAccessDeniedError({ message: 'Access denied', statusCode: 404 })).toBe(false);
        expect(isAccessDeniedError({ message: 'Server error', statusCode: 500 })).toBe(false);
        expect(isAccessDeniedError({ message: 'Too many requests', statusCode: 429 })).toBe(false);
    });

    test('falls back to the message when no status code survived serialization', () => {
        expect(isAccessDeniedError({ message: 'Access denied' })).toBe(true);
        expect(isAccessDeniedError({ message: 'accessDenied' })).toBe(true);
        expect(isAccessDeniedError({ message: 'Forbidden' })).toBe(true);
        expect(isAccessDeniedError({ message: 'x', code: 'accessDenied' })).toBe(true);
    });

    test('does not classify unrelated failures as access denied', () => {
        expect(isAccessDeniedError({ message: 'Failed to fetch' })).toBe(false);
        expect(isAccessDeniedError({ message: 'itemNotFound', code: 'itemNotFound' })).toBe(false);
        expect(isAccessDeniedError({ message: '' })).toBe(false);
    });
});

test.describe('diagnoseAccessDenied', () => {
    test('tags an access-denied failure when the extension app has no grant', async () => {
        const result = await diagnoseAccessDenied({ message: 'Access denied', statusCode: 403 }, denied);
        expect(result.missingPermissions).toBe(true);
        expect(result.error.code).toBe(MISSING_EXTENSION_PERMISSIONS_CODE);
        expect(result.error.message).toBe(MISSING_EXTENSION_PERMISSIONS_MESSAGE);
        // The original status code is preserved for logging/telemetry.
        expect(result.error.statusCode).toBe(403);
    });

    test('leaves the error alone when the grant is present', async () => {
        const original = { message: 'Access denied', statusCode: 403 };
        const result = await diagnoseAccessDenied(original, granted);
        expect(result.missingPermissions).toBe(false);
        expect(result.error).toEqual(original);
    });

    test('does not run the permission check for non-auth failures', async () => {
        let checked = false;
        const result = await diagnoseAccessDenied(
            { message: 'Server error', statusCode: 500 },
            async () => { checked = true; return false; },
        );
        expect(checked).toBe(false);
        expect(result.missingPermissions).toBe(false);
        expect(result.error.code).toBeUndefined();
    });

    test('never masks the original failure when the permission check itself throws', async () => {
        // The strict checker throws when the grant cannot be read. A Graph outage during a
        // 403 must not be reported to the user as "you are missing permissions".
        const original = { message: 'Access denied', statusCode: 403 };
        const result = await diagnoseAccessDenied(original, async () => { throw new Error('graph down'); });
        expect(result.missingPermissions).toBe(false);
        expect(result.error).toEqual(original);
        expect(result.error.message).toBe('Access denied');
    });
});
