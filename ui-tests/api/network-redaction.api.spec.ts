/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import {
    REDACTED,
    redactBody,
    redactHeaders,
    redactNetworkRequest,
    redactUrl,
} from '../../src/services/StorageExplorer/networkRedaction';
import type { NetworkRequest } from '../../src/services/StorageExplorer/protocol';

const JWT = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJodHRwczovL2dyYXBoIn0.SIGNATURE';

test.describe('redactUrl — pre-authenticated URLs', () => {
    test('drops the whole query of an SPO download URL', () => {
        const out = redactUrl(
            'https://contoso.sharepoint.com/_layouts/15/download.aspx?UniqueId=abc&tempauth=' + JWT,
        );
        expect(out).toBe(`https://contoso.sharepoint.com/_layouts/15/download.aspx?${REDACTED}`);
        expect(out).not.toContain('tempauth');
        expect(out).not.toContain('eyJ');
    });

    test('drops the whole query of an upload-session URL', () => {
        const out = redactUrl(
            "https://contoso.sharepoint.com/_api/v2.0/drives/b!x/items/01ABC/uploadSession?guid='g'&access_token=" + JWT,
        );
        expect(out).not.toContain('access_token');
        expect(out).not.toContain(JWT);
        expect(out).toContain('/uploadSession');
    });

    test('keeps the path so the entry stays recognisable', () => {
        expect(redactUrl('https://contoso.sharepoint.com/a/b/c.docx')).toBe(
            'https://contoso.sharepoint.com/a/b/c.docx',
        );
    });

    test('drops a credential-bearing fragment', () => {
        expect(redactUrl('https://contoso.sharepoint.com/x#token=abc')).toContain(REDACTED);
    });
});

test.describe('redactUrl — Graph URLs', () => {
    test('preserves OData query parameters', () => {
        const url = 'https://graph.microsoft.com/v1.0/drives/b!x/root/children?$select=id,name&$top=200';
        expect(redactUrl(url)).toBe(url);
    });

    test('preserves the paging skiptoken', () => {
        const url = 'https://graph.microsoft.com/v1.0/drives/b!x/items?$skiptoken=UGFnZToy';
        expect(redactUrl(url)).toBe(url);
    });

    test('still redacts a credential parameter on Graph', () => {
        const out = redactUrl(`https://graph.microsoft.com/v1.0/me?access_token=${JWT}`);
        expect(out).toContain(`access_token=${REDACTED}`);
        expect(out).not.toContain(JWT);
    });
});

test.describe('redactHeaders', () => {
    test('removes Authorization, Cookie, and Set-Cookie', () => {
        const out = redactHeaders({
            Authorization: `Bearer ${JWT}`,
            Cookie: 'FedAuth=abc',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'set-cookie': 'rtFa=xyz',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'content-type': 'application/json',
        });
        expect(out.Authorization).toBe(REDACTED);
        expect(out.Cookie).toBe(REDACTED);
        expect(out['set-cookie']).toBe(REDACTED);
        expect(out['content-type']).toBe('application/json');
        expect(JSON.stringify(out)).not.toContain(JWT);
    });

    test('redacts a pre-authenticated redirect Location header', () => {
        const out = redactHeaders({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            location: `https://contoso.sharepoint.com/_layouts/download.aspx?tempauth=${JWT}`,
        });
        expect(out.location).not.toContain(JWT);
        expect(out.location).toContain(REDACTED);
    });
});

test.describe('redactBody — capability URLs in JSON', () => {
    test('redacts @microsoft.graph.downloadUrl', () => {
        const body = JSON.stringify({
            id: '01ABC',
            name: 'report.docx',
            '@microsoft.graph.downloadUrl': `https://contoso.sharepoint.com/d?tempauth=${JWT}`,
        });
        const out = redactBody(body)!;
        expect(out).not.toContain(JWT);
        expect(JSON.parse(out)['@microsoft.graph.downloadUrl']).toBe(REDACTED);
        expect(JSON.parse(out).name).toBe('report.docx');
    });

    test('redacts an upload-session uploadUrl', () => {
        const out = redactBody(JSON.stringify({ uploadUrl: 'https://contoso.sharepoint.com/u?access_token=x' }))!;
        expect(JSON.parse(out).uploadUrl).toBe(REDACTED);
    });

    test('redacts the preview getUrl', () => {
        const out = redactBody(JSON.stringify({ getUrl: 'https://contoso.sharepoint.com/p?tempauth=x' }))!;
        expect(JSON.parse(out).getUrl).toBe(REDACTED);
    });

    test('redacts a sharing link webUrl but keeps a driveItem webUrl', () => {
        const body = JSON.stringify({
            webUrl: 'https://contoso.sharepoint.com/Docs/report.docx',
            link: { type: 'view', scope: 'anonymous', webUrl: 'https://contoso.sharepoint.com/:w:/g/SECRETCAP' },
        });
        const parsed = JSON.parse(redactBody(body)!);
        expect(parsed.webUrl).toBe('https://contoso.sharepoint.com/Docs/report.docx');
        expect(parsed.link.webUrl).toBe(REDACTED);
        expect(redactBody(body)).not.toContain('SECRETCAP');
    });

    test('redacts capability URLs nested in an array of items', () => {
        const body = JSON.stringify({
            value: [
                { id: '1', '@microsoft.graph.downloadUrl': `https://x.sharepoint.com/a?tempauth=${JWT}` },
                { id: '2', '@microsoft.graph.downloadUrl': `https://x.sharepoint.com/b?tempauth=${JWT}` },
            ],
        });
        expect(redactBody(body)).not.toContain(JWT);
    });
});

test.describe('redactBody — tokens and PII', () => {
    test('redacts a bare JWT appearing anywhere in a body', () => {
        expect(redactBody(JSON.stringify({ note: `token is ${JWT}` }))).not.toContain(JWT);
    });

    test('masks email addresses while keeping the domain', () => {
        const out = redactBody(JSON.stringify({ mail: 'ada.lovelace@contoso.com' }))!;
        expect(JSON.parse(out).mail).toBe('a***@contoso.com');
        expect(out).not.toContain('ada.lovelace');
    });

    test('masks emails in a people-picker style response', () => {
        const body = JSON.stringify({
            value: [
                { displayName: 'Ada Lovelace', userPrincipalName: 'ada@contoso.com', mail: 'ada@contoso.com' },
            ],
        });
        const out = redactBody(body)!;
        expect(out).not.toContain('ada@contoso.com');
        expect(out).toContain('a***@contoso.com');
        expect(JSON.parse(out).value[0].displayName).toBe('Ada Lovelace');
    });

    test('leaves binary-size placeholders untouched', () => {
        expect(redactBody('[5898240 bytes]')).toBe('[5898240 bytes]');
    });

    test('truncates an oversized body', () => {
        const out = redactBody('x'.repeat(200_000))!;
        expect(out.length).toBeLessThan(70_000);
        expect(out).toContain('[truncated]');
    });

    test('does not mark a body that fits as truncated', () => {
        expect(redactBody('short body')).toBe('short body');
    });

    test('handles non-JSON and empty bodies without throwing', () => {
        expect(redactBody(undefined)).toBeUndefined();
        expect(redactBody('')).toBe('');
        expect(redactBody('<html>not json</html>')).toBe('<html>not json</html>');
        expect(redactBody('{ broken json')).toBeDefined();
    });
});

test.describe('redactNetworkRequest', () => {
    test('scrubs every field of a realistic chunk-upload entry', () => {
        const entry: NetworkRequest = {
            id: 'chunk-1',
            method: 'PUT',
            url: `https://contoso.sharepoint.com/_api/v2.0/drives/b!x/uploadSession?access_token=${JWT}`,
            status: 202,
            statusText: 'Accepted',
            durationMs: 120,
            timestamp: new Date().toISOString(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            requestHeaders: { Authorization: `Bearer ${JWT}`, 'Content-Range': 'bytes 0-100/200' },
            requestBody: '[5898240 bytes, offset 0–5898239]',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            responseHeaders: { 'set-cookie': 'FedAuth=abc' },
            responseBody: JSON.stringify({ uploadUrl: `https://contoso.sharepoint.com/u?access_token=${JWT}` }),
        };

        const serialized = JSON.stringify(redactNetworkRequest(entry));
        expect(serialized).not.toContain(JWT);
        expect(serialized).not.toContain('FedAuth=abc');
        expect(serialized).not.toContain('access_token=eyJ');
        // Still useful as a diagnostic.
        expect(serialized).toContain('uploadSession');
        expect(serialized).toContain('202');
    });

    test('redacts a capability URL embedded in an error message', () => {
        const entry = {
            id: 'e', method: 'GET', url: 'https://graph.microsoft.com/v1.0/me',
            status: 0, statusText: 'Error', durationMs: 1, timestamp: new Date().toISOString(),
            requestHeaders: {}, responseHeaders: {},
            error: `failed to fetch https://contoso.sharepoint.com/x?tempauth=${JWT}`,
        } as NetworkRequest;
        expect(redactNetworkRequest(entry).error).not.toContain(JWT);
    });

    test('is idempotent', () => {
        const entry = {
            id: 'e', method: 'GET',
            url: `https://contoso.sharepoint.com/x?tempauth=${JWT}`,
            status: 200, statusText: 'OK', durationMs: 1, timestamp: new Date().toISOString(),
            requestHeaders: {}, responseHeaders: {},
            responseBody: JSON.stringify({ mail: 'ada@contoso.com' }),
        } as NetworkRequest;
        const once = redactNetworkRequest(entry);
        expect(redactNetworkRequest(once)).toEqual(once);
    });
});
