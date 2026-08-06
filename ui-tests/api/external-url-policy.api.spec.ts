/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { describeUrlForLog, evaluateExternalUrl } from '../../src/services/StorageExplorer/externalUrlPolicy';

const SPO = 'https://contoso.sharepoint.com';

test.describe('externalUrlPolicy — permitted destinations', () => {
    test('allows SharePoint https URLs', () => {
        expect(evaluateExternalUrl(`${SPO}/Docs/file.docx`).allowed).toBe(true);
    });

    test('allows a pre-authenticated download URL with a query string', () => {
        const decision = evaluateExternalUrl(`${SPO}/_layouts/15/download.aspx?UniqueId=1&access_token=abc`);
        expect(decision.allowed).toBe(true);
    });

    test('allows sovereign-cloud SharePoint hosts', () => {
        for (const host of [
            'contoso.sharepoint.us',
            'contoso.sharepoint-mil.us',
            'contoso.sharepoint.de',
            'contoso.partner.sharepointonline.cn',
        ]) {
            expect(evaluateExternalUrl(`https://${host}/x`).allowed, host).toBe(true);
        }
    });

    test('allows the Office Online preview host', () => {
        expect(evaluateExternalUrl('https://officeapps.live.com/x').allowed).toBe(true);
    });

    test('allows reviewed Office desktop deep links', () => {
        for (const scheme of ['ms-word', 'ms-excel', 'ms-powerpoint']) {
            const decision = evaluateExternalUrl(`${scheme}:ofe|u|${SPO}/Docs/file.docx`);
            expect(decision.allowed, scheme).toBe(true);
        }
    });
});

test.describe('externalUrlPolicy — rejected schemes', () => {
    for (const url of [
        'file:///C:/Windows/System32/calc.exe',
        'vscode://ms-vscode.node-debug/launch',
        'command:workbench.action.terminal.new',
        'data:text/html,<script>alert(1)</script>',
        'javascript:alert(1)',
        'http://contoso.sharepoint.com/x',
        'ftp://contoso.sharepoint.com/x',
        'ms-outlook://compose',
    ]) {
        test(`rejects ${url.slice(0, 40)}`, () => {
            expect(evaluateExternalUrl(url).allowed).toBe(false);
        });
    }
});

test.describe('externalUrlPolicy — rejected hosts and shapes', () => {
    test('rejects a lookalike registrable domain', () => {
        expect(evaluateExternalUrl('https://evil-sharepoint.com/x').allowed).toBe(false);
    });

    test('rejects a suffix-appended domain', () => {
        expect(evaluateExternalUrl('https://contoso.sharepoint.com.evil.io/x').allowed).toBe(false);
    });

    test('rejects an entirely unexpected host', () => {
        expect(evaluateExternalUrl('https://attacker.example/collect').allowed).toBe(false);
    });

    test('rejects credentials embedded in the URL', () => {
        const decision = evaluateExternalUrl('https://user:pass@contoso.sharepoint.com/x');
        expect(decision.allowed).toBe(false);
        expect(decision.allowed === false && decision.reason).toContain('credentials');
    });

    test('rejects a userinfo phishing form pointing at an unexpected host', () => {
        expect(evaluateExternalUrl('https://contoso.sharepoint.com@attacker.example/x').allowed).toBe(false);
    });

    test('rejects a non-default port', () => {
        expect(evaluateExternalUrl('https://contoso.sharepoint.com:8443/x').allowed).toBe(false);
    });

    test('rejects whitespace, control characters, and backslashes', () => {
        for (const url of [
            'https://contoso.sharepoint.com/a b',
            'https://contoso.sharepoint.com/\u0000',
            'https:\\\\contoso.sharepoint.com/x',
            'https://contoso.sharepoint.com\\@attacker.example/x',
        ]) {
            expect(evaluateExternalUrl(url).allowed, url).toBe(false);
        }
    });

    test('rejects non-string and empty input', () => {
        for (const value of [undefined, null, 42, {}, [], '']) {
            expect(evaluateExternalUrl(value).allowed).toBe(false);
        }
    });

    test('rejects an over-long URL', () => {
        expect(evaluateExternalUrl(`${SPO}/${'a'.repeat(5000)}`).allowed).toBe(false);
    });
});

test.describe('externalUrlPolicy — Office deep-link payloads', () => {
    test('rejects a nested non-https target', () => {
        expect(evaluateExternalUrl('ms-word:ofe|u|file:///etc/passwd').allowed).toBe(false);
    });

    test('rejects a nested target on an unexpected host', () => {
        expect(evaluateExternalUrl('ms-word:ofe|u|https://attacker.example/x.docx').allowed).toBe(false);
    });

    test('rejects an unreviewed Office command verb', () => {
        expect(evaluateExternalUrl(`ms-word:nft|u|${SPO}/x.docx`).allowed).toBe(false);
    });

    test('rejects a deep link with no payload', () => {
        expect(evaluateExternalUrl('ms-word:').allowed).toBe(false);
    });
});

test.describe('describeUrlForLog', () => {
    test('omits the path, query, and any pre-authenticated token', () => {
        const description = describeUrlForLog(`${SPO}/_layouts/download.aspx?access_token=SECRET123`);
        expect(description).toBe('https://contoso.sharepoint.com');
        expect(description).not.toContain('SECRET123');
    });

    test('does not leak the payload of an opaque scheme', () => {
        expect(describeUrlForLog('ms-word:ofe|u|https://contoso.sharepoint.com/x')).toBe('ms-word:<opaque>');
    });

    test('handles unparseable input', () => {
        expect(describeUrlForLog('not a url')).toBe('<unparseable>');
    });
});
